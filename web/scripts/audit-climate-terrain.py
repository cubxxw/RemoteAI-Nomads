"""Compare a GeoNames point DEM height with the NASA native-cell mean height.

This quality gate selects higher-resolution source retrieval; it never applies a
lapse-rate correction or changes source weather numbers. Offline by default.
"""
import argparse
import concurrent.futures
import importlib.util
import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("climate_nasa_terrain", Path(__file__).with_name("complete-climate-nasa.py"))
nasa = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(nasa)
base = nasa.base


def audit(args):
    cache = args.out / "terrain-geocoding"
    cache.mkdir(parents=True, exist_ok=True)
    places = base.read_catalog(args.database, args.catalog)
    base.apply_resolutions(places, args.out)
    places = [p for p in places if p["missing_months"] and p["latitude"] is not None]
    stopped, lock = threading.Event(), threading.Lock()

    def inspect(place):
        cell = nasa.grid(place)
        raw = args.out / "nasa" / (str(cell[0]) + "_" + str(cell[1]) + ".json")
        if not raw.exists():
            return dict(slug=place["slug"], status="NASA not used")
        data = json.loads(raw.read_text())
        grid_height = data["response"]["geometry"]["coordinates"][2]
        result = dict(slug=place["slug"], grid_elevation_m=grid_height, nasa_source_url=data["url"])
        target = cache / (place["slug"] + ".json")
        url = "https://geocoding-api.open-meteo.com/v1/get?id=" + str(place["geonames_id"])
        try:
            if place.get("location_new"):
                envelope = json.loads((args.out / "geocoding" / (place["slug"] + ".json")).read_text())
                url = envelope["url"]
            elif target.exists():
                envelope = json.loads(target.read_text())
                if envelope["url"] != url:
                    raise ValueError("GeoNames cache identity mismatch")
            elif args.fetch and not stopped.is_set() and place["geonames_id"] is not None:
                with lock:
                    reason = base.spend_request(args.out, url, 1)
                    if reason:
                        stopped.set()
                        raise ValueError(reason)
                with urllib.request.urlopen(url, timeout=30) as response:
                    decoded = json.load(response)
                envelope = dict(url=url, checked_at=base.CHECKED, response=decoded)
                target.write_text(json.dumps(envelope, ensure_ascii=False, indent=2) + "\n")
                time.sleep(.3)
            else:
                raise ValueError("GeoNames height not collected")
            records = envelope["response"].get("results", [envelope["response"]])
            matches = [r for r in records if r["id"] == place["geonames_id"] and r["country_code"] == place["country_id"]]
            if len(matches) != 1:
                raise ValueError("GeoNames country/id mismatch")
            point_height = matches[0]["elevation"]
            if not isinstance(point_height, (int, float)) or not -500 <= point_height <= 9000:
                raise ValueError("GeoNames elevation is unavailable or a missing-value sentinel")
            mismatch = round(grid_height - point_height, 2)
            result.update(point_elevation_m=point_height, elevation_difference_m=mismatch,
                          point_elevation_source_url=url, point_name=matches[0]["name"],
                          replace_with_era5=abs(mismatch) >= 400,
                          reason="grid/point elevation difference >=400m" if abs(mismatch) >= 400 else "within 400m elevation threshold")
        except Exception as error:
            if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                stopped.set()
            result.update(replace_with_era5=grid_height >= 1000,
                          reason="high native-grid elevation; point height unavailable" if grid_height >= 1000 else "coarse grid reference retained", error=str(error))
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(inspect, places))
    by_slug = {p["slug"]: p for p in places}
    for record in records:
        era5 = args.out / "climate" / (record["slug"] + ".json")
        if era5.exists():
            envelope = json.loads(era5.read_text())
            if envelope["url"] != base.archive_url(by_slug[record["slug"]]):
                raise ValueError("Selected ERA5 coordinate identity mismatch: " + record["slug"])
            months = base.aggregate(envelope["response"])
            record.update(selected_model="ERA5", selected_source_url=envelope["url"],
                          selected_provider_elevation_m=envelope["response"].get("elevation"),
                          selected_annual_mean_c=round(sum(m["mean_c"] * m["sample_days"] for m in months) / 1096, 2))
        elif "nasa_source_url" in record:
            record.update(selected_model="MERRA-2", selected_source_url=record["nasa_source_url"],
                          limitation="native-cell average; temperature is not adjusted to city elevation")
    priority = [r["slug"] for r in sorted(records, key=lambda r: abs(r.get("elevation_difference_m", r.get("grid_elevation_m", 0))), reverse=True) if r.get("replace_with_era5")]
    report = dict(checked_at=base.CHECKED, threshold_m=400, status="evaluation of grid representativeness, not an altitude correction",
                  point_height="GeoNames point DEM height", grid_height="NASA MERRA-2 grid average elevation",
                  era5_priority=priority, records=records, stopped_on_429=stopped.is_set(),
                  unresolved_quality_flags=[r["slug"] for r in records if r.get("replace_with_era5") and r.get("selected_model") != "ERA5"])
    (args.out / "terrain-quality.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(dict(priority=priority, point_heights_verified=sum("point_elevation_m" in r for r in records), missing_heights=[r["slug"] for r in records if "error" in r]), ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=base.ROOT / ".data/release/published.sqlite")
    parser.add_argument("--catalog", type=Path, default=base.ROOT / "public/published-pages/rankings.json")
    parser.add_argument("--out", type=Path, default=base.ROOT / ".data/climate-completion")
    parser.add_argument("--fetch", action="store_true")
    audit(parser.parse_args())
