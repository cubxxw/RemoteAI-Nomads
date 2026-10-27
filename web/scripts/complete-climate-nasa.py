"""Complete missing catalog climate using NASA POWER/MERRA-2, preserving ERA5.

Offline by default. --fetch collects at most three concurrent, distinct MERRA-2
cells. Raw responses retain API metadata, units, source names, and grid elevation.
"""
import argparse
import concurrent.futures
import datetime as dt
import importlib.util
import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("climate_completion", Path(__file__).with_name("complete-climate.py"))
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
NASA_VARS = ("T2M", "T2M_MAX", "PRECTOTCORR")


def grid(place):
    # MERRA-2 native grid: lat=-90..90/0.5; lon=-180..179.375/0.625.
    return (math.floor(place["latitude"] / .5 + .5) * .5,
            ((math.floor(place["longitude"] / .625 + .5) * .625 + 180) % 360) - 180)


def nasa_url(cell):
    lat, lon = cell
    return "https://power.larc.nasa.gov/api/temporal/daily/point?" + urllib.parse.urlencode({
        "parameters": ",".join(NASA_VARS), "community": "AG", "longitude": lon, "latitude": lat,
        "start": base.START.replace("-", ""), "end": base.END.replace("-", ""), "format": "JSON", "time-standard": "UTC"})


def aggregate_nasa(data):
    header = data.get("header", {})
    if header.get("time_standard") != "UTC" or header.get("start") != "20230101" or header.get("end") != "20251231":
        raise ValueError("NASA period/time-standard mismatch")
    if "MERRA2" not in header.get("sources", []) or any("GEOS" in s for s in header["sources"]):
        raise ValueError("NASA response is not the expected MERRA2 source")
    parameters = data.get("parameters", {})
    if [parameters.get(k, {}).get("units") for k in NASA_VARS] != ["C", "C", "mm/day"]:
        raise ValueError("NASA units mismatch")
    dates = [d.replace("-", "") for d in base.DATES]
    source = data.get("properties", {}).get("parameter", {})
    daily = {"time": base.DATES}
    for source_key, dest_key in zip(NASA_VARS, base.VARIABLES):
        values = source.get(source_key, {})
        if sorted(values) != dates:
            raise ValueError("NASA date coverage mismatch: " + source_key)
        daily[dest_key] = [values[d] for d in dates]
    # mm/day over a 1-day interval is millimeters, so the monthly sum is unchanged.
    return base.aggregate({"daily": daily, "daily_units": dict(zip(base.VARIABLES, ("°C", "°C", "mm")))})


def collect(args):
    out = args.out
    cache = out / "nasa"
    cache.mkdir(parents=True, exist_ok=True)
    places = base.read_catalog(args.database, args.catalog)
    base.apply_resolutions(places, out)
    needed = [p for p in places if p["missing_months"]]
    results, groups = [], {}
    for p in needed:
        era5 = out / "climate" / (p["slug"] + ".json")
        if era5.exists():
            raw = json.loads(era5.read_text())
            if raw["url"] != base.archive_url(p) or raw["model"] != "ERA5":
                raise ValueError("ERA5 cache identity mismatch: " + p["slug"])
            results.append(dict(slug=p["slug"], place=p, model="ERA5", url=raw["url"],
                                months=base.aggregate(raw["response"]), raw_sha256=base.sha(era5)))
        elif p["latitude"] is None:
            results.append(dict(slug=p["slug"], place=p, error="coordinate_unresolved"))
        else:
            groups.setdefault(grid(p), []).append(p)
    stop, lock = threading.Event(), threading.Lock()
    counters = {"fetched": 0}

    def fetch_cell(item):
        cell, members = item
        url = nasa_url(cell)
        path = cache / (str(cell[0]) + "_" + str(cell[1]) + ".json")
        try:
            if path.exists():
                envelope = json.loads(path.read_text())
                if envelope["url"] != url or envelope["model"] != "MERRA-2":
                    raise ValueError("NASA cache identity mismatch")
            elif not args.fetch or stop.is_set():
                return [dict(slug=p["slug"], place=p, error="upstream_429_stop" if stop.is_set() else "not_collected") for p in members]
            else:
                with lock:
                    if counters["fetched"] >= args.max_fetch:
                        return [dict(slug=p["slug"], place=p, error="batch_limit_reached") for p in members]
                    counters["fetched"] += 1
                    with (out / "nasa-request-ledger.jsonl").open("a") as f:
                        f.write(json.dumps(dict(timestamp=time.time(), url=url, cell=cell)) + "\n")
                request = urllib.request.Request(url, headers={"User-Agent": "Roamorrow-public-climate-research/1.0"})
                with urllib.request.urlopen(request, timeout=90) as response:
                    data = json.load(response)
                aggregate_nasa(data)
                envelope = dict(url=url, model="MERRA-2", checked_at=base.CHECKED,
                                fetched_at=dt.datetime.now(dt.timezone.utc).isoformat(), grid_center=cell, response=data)
                path.write_text(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")))
                time.sleep(.5)
            months = aggregate_nasa(envelope["response"])
            elevation = envelope["response"].get("geometry", {}).get("coordinates", [None, None, None])[2]
            return [dict(slug=p["slug"], place=p, url=url, model="MERRA-2", months=months,
                         grid_center=list(cell), grid_elevation_m=elevation,
                         api_version=envelope["response"]["header"]["api"]["version"], raw_sha256=base.sha(path)) for p in members]
        except urllib.error.HTTPError as error:
            if error.code == 429:
                stop.set()
            return [dict(slug=p["slug"], place=p, error="NASA HTTP " + str(error.code)) for p in members]
        except Exception as error:
            return [dict(slug=p["slug"], place=p, error=str(error)[:250]) for p in members]

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, batch in enumerate(pool.map(fetch_cell, groups.items()), 1):
            results.extend(batch)
            if i % 10 == 0:
                print(json.dumps(dict(cells_processed=i, cells_total=len(groups), verified=sum("months" in r for r in results), fetched=counters["fetched"])), flush=True)
    results.sort(key=lambda r: r["slug"])
    successful = [r for r in results if "months" in r]
    models = {model: [r["slug"] for r in successful if r["model"] == model] for model in ("ERA5", "MERRA-2")}
    summary = dict(checked_at=base.CHECKED, period_start=base.START, period_end=base.END, timezone="UTC",
                   input_database_sha256=base.sha(args.database), input_catalog_sha256=base.sha(args.catalog),
                   catalog_cities=len(places), before_complete_cities=len(places) - len(needed), missing_cities=len(needed),
                   verified_backfill_cities=len(successful), verified_backfill_months=sum(len(r["place"]["missing_months"]) - len(r["place"]["partial_months"]) for r in successful),
                   after_complete_cities=len(places) - len(needed) + sum(not r["place"]["partial_months"] for r in successful),
                   models=models, nasa_unique_grid_cells=len(groups), nasa_fetched_this_run=counters["fetched"],
                   stopped_on_429=stop.is_set(), unresolved_coordinates=[p["slug"] for p in places if p["latitude"] is None],
                   new_location_records=[r["slug"] for r in successful if r["place"].get("location_new")],
                   remaining=[dict(slug=r["slug"], reason=r["error"]) for r in results if "error" in r],
                   partial_existing_rows=[dict(slug=p["slug"], months=p["partial_months"]) for p in places if p["partial_months"]],
                   high_elevation_grid_cells=[dict(slug=r["slug"], grid_elevation_m=r["grid_elevation_m"], annual_mean_c=round(sum(m["mean_c"] * m["sample_days"] for m in r["months"]) / 1096, 2)) for r in successful if r.get("grid_elevation_m", 0) >= 1000],
                   methodology="1096 UTC days during 2023–2025. Calendar-month means of daily mean/max temperature; precipitation monthly sums averaged across three years. Existing ERA5 remains unchanged; NASA MERRA-2 values represent native 0.5x0.625-degree cells, without city-altitude temperature correction. These are recent historical reanalysis estimates, not 30-year climate normals or station measurements.")
    (out / "backfill.sql").write_text(base.make_sql(results))
    (out / "verified-months.json").write_text(json.dumps(successful, ensure_ascii=False, indent=2) + "\n")
    (out / "report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in summary.items() if k not in ("models", "remaining", "high_elevation_grid_cells", "methodology")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=base.ROOT / ".data/release/published.sqlite")
    parser.add_argument("--catalog", type=Path, default=base.ROOT / "public/published-pages/rankings.json")
    parser.add_argument("--out", type=Path, default=base.ROOT / ".data/climate-completion")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--max-fetch", type=int, default=1000)
    parser.add_argument("--workers", type=int, choices=(1, 2, 3), default=3)
    args = parser.parse_args()
    collect(args)
