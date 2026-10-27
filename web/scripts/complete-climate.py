"""Prepare a provenance-preserving ERA5 backfill without changing the input DB.

Default mode is offline. --fetch permits bounded, resumable source collection.
The API returns reanalysis estimates, not weather-station observations or normals.
"""
import argparse
import calendar
import collections
import datetime as dt
import hashlib
import json
import math
import sqlite3
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START, END, CHECKED = "2023-01-01", "2025-12-31", "2026-10-27"
VARIABLES = ("temperature_2m_mean", "temperature_2m_max", "precipitation_sum")
DATES = [(dt.date.fromisoformat(START) + dt.timedelta(days=i)).isoformat()
         for i in range((dt.date.fromisoformat(END) - dt.date.fromisoformat(START)).days + 1)]
# Conservative documented accounting: one location, one model, <=10 variables.
REQUEST_WEIGHT = max(1, len(DATES) / 14)
PRIORITY = ["la-paz", "tbilisi", "bansko", "ericeira", "lanzarote", "ponta-do-sol",
            "anji", "barcelona", "berlin", "medellin", "mexico-city", "cape-town",
            "bangalore", "seoul", "busan", "jeju", "taipei", "tainan", "kaohsiung",
            "canggu", "koh-phangan", "siargao", "kuta-lombok", "ella",
            "ahangama-weligama", "kathmandu", "nha-trang", "luang-prabang", "siem-reap",
            "vientiane", "phnom-penh", "kampot", "yogyakarta", "dumaguete", "baguio",
            "hong-kong", "shanghai", "beijing", "guangzhou", "macao", "krabi", "ipoh",
            "kuching", "malacca", "gozo", "budva", "sarajevo", "novi-sad", "budapest",
            "athens", "istanbul", "prague", "lima", "quito", "cusco", "oaxaca"]


def q(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError("non-finite SQL value")
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def archive_url(place):
    return "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode({
        "latitude": place["latitude"], "longitude": place["longitude"],
        "start_date": START, "end_date": END, "daily": ",".join(VARIABLES),
        "models": "era5", "timezone": "UTC"})


def aggregate(data):
    """Reject any gap or misaligned array; never turn missing days into zero rain."""
    daily = data.get("daily", {})
    if daily.get("time") != DATES:
        raise ValueError("date coverage must be the exact ordered 1096-day period")
    units = data.get("daily_units", {})
    if any(units.get(k) != unit for k, unit in zip(VARIABLES, ("°C", "°C", "mm"))):
        raise ValueError("unexpected units")
    for key in VARIABLES:
        values = daily.get(key, [])
        if len(values) != len(DATES) or any(isinstance(x, bool) or not isinstance(x, (int, float))
                                         or not math.isfinite(x) for x in values):
            raise ValueError("missing or invalid values for " + key)
    months = collections.defaultdict(list)
    for date, mean, high, rain in zip(DATES, *(daily[k] for k in VARIABLES)):
        if not -100 <= mean <= high <= 70 or not 0 <= rain <= 3000:
            raise ValueError("implausible daily values: " + date)
        months[int(date[5:7])].append((mean, high, rain))
    result = []
    for month in range(1, 13):
        rows = months[month]
        expected = sum(calendar.monthrange(y, month)[1] for y in (2023, 2024, 2025))
        if len(rows) != expected:
            raise ValueError("incomplete calendar month")
        result.append(dict(month=month, mean_c=round(statistics.mean(r[0] for r in rows), 2),
                           high_c=round(statistics.mean(r[1] for r in rows), 2),
                           rain_mm=round(sum(r[2] for r in rows) / 3, 2), sample_days=len(rows)))
    return result


def read_catalog(database, public):
    db = sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    catalog = json.loads(public.read_text())
    result = []
    for item in catalog:
        matches = db.execute("SELECT c.id,c.slug,c.country_id,l.latitude,l.longitude,l.timezone,"
                             "l.geonames_id,l.match_method,l.source_id,l.checked_at,s.url location_url "
                             "FROM cities c LEFT JOIN city_locations l ON l.city_id=c.id "
                             "LEFT JOIN sources s ON s.id=l.source_id WHERE c.slug=? AND c.country_id=?",
                             (item["slug"], item["countryId"])).fetchall()
        if len(matches) != 1:
            raise ValueError("catalog identity is not unique: " + item["slug"])
        row = dict(matches[0])
        old = {r["month"]: dict(r) for r in db.execute(
            "SELECT * FROM city_climate_months WHERE city_id=?", (row["id"],))}
        row["missing_months"] = [m for m in range(1, 13) if m not in old or
                                 any(old[m][k] is None for k in ("mean_c", "high_c", "rain_mm"))]
        row["partial_months"] = [m for m in row["missing_months"] if m in old and
                                 any(old[m][k] is not None for k in ("mean_c", "high_c", "rain_mm"))]
        row["name_en"] = item["nameEn"]
        result.append(row)
    db.close()
    return result


def apply_resolutions(places, out):
    path = out / "location-resolutions.json"
    choices = json.loads(path.read_text()) if path.exists() else []
    by_slug = {p["slug"]: p for p in places}
    for choice in choices:
        place = by_slug[choice["slug"]]
        if place["latitude"] is not None:
            continue
        evidence = json.loads((out / "geocoding" / (place["slug"] + ".json")).read_text())
        matches = [r for r in evidence["response"].get("results", [])
                   if r["id"] == choice["geonames_id"] and r["country_code"] == place["country_id"]]
        if len(matches) != 1 or choice["country_id"] != place["country_id"]:
            raise ValueError("geocoding identity mismatch: " + place["slug"])
        match = matches[0]
        place.update(latitude=match["latitude"], longitude=match["longitude"], timezone=match["timezone"],
                     geonames_id=match["id"], match_method=choice["match_method"],
                     location_url=evidence["url"], location_new=True, location_note=choice["note"])


def spend_request(out, url, weight, minute=550, hour=4500, day=9000):
    """Count attempted requests before network I/O; preserve a local rolling ledger."""
    path = out / "request-ledger.jsonl"
    ledger = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
    now = time.time()
    for seconds, limit, name in ((60, minute, "minute"), (3600, hour, "hour"), (86400, day, "day")):
        used = sum(r["weight"] for r in ledger if now - r["timestamp"] < seconds)
        if used + weight > limit:
            return name + "_budget_exhausted"
    with path.open("a") as f:
        f.write(json.dumps(dict(timestamp=now, url=url, weight=weight)) + "\n")
    return None


def source_sql(url, publisher, title, kind="dataset", license="CC BY 4.0"):
    sid = "climate-completion:" + hashlib.sha256(url.encode()).hexdigest()[:24]
    values = (sid, url, publisher, title, kind, license, CHECKED)
    return "INSERT OR IGNORE INTO sources(id,url,publisher,title,kind,license,accessed_at) VALUES(" + ",".join(q(v) for v in values) + ");"


def make_sql(results):
    sql = ["-- Incremental historical-weather backfill. City identities are resolved by slug AND country.",
           "-- Existing valid climate rows and original city_months labels are preserved.",
           "-- Source references resolve by URL, including when an existing source uses a different ID."]
    for result in results:
        if "months" not in result:
            continue
        p = result["place"]
        city_where = "slug=" + q(p["slug"]) + " AND country_id=" + q(p["country_id"])
        if p.get("location_new"):
            url = p["location_url"]
            sql.append(source_sql(url, "Open-Meteo / GeoNames", "目的地坐标检索；" + p["location_note"]))
            values = [p[k] for k in ("latitude", "longitude", "timezone", "geonames_id", "match_method")]
            sql.append("INSERT OR IGNORE INTO city_locations(city_id,latitude,longitude,timezone,geonames_id,match_method,source_id,checked_at) "
                       "SELECT id," + ",".join(q(v) for v in values) + ",(SELECT id FROM sources WHERE url=" + q(url) + ")," + q(CHECKED) +
                       " FROM cities WHERE " + city_where + ";")
        url = result["url"]
        model = result.get("model", "ERA5")
        if model == "MERRA-2":
            version = result.get("api_version", "2.x")
            elevation = "；网格平均海拔 " + str(result["grid_elevation_m"]) + "m" if "grid_elevation_m" in result else ""
            sql.append(source_sql(url, "NASA POWER / MERRA-2", "NASA POWER Daily API " + version + "；2023–2025 MERRA-2历史天气；0.5°×0.625°网格月聚合" + elevation + "；气温未按城市海拔校正", "official", "NASA POWER public data; attribution requested"))
        else:
            sql.append(source_sql(url, "Open-Meteo / ECMWF ERA5", "2023–2025 ERA5历史天气逐日再分析；按历月聚合", "official"))
        for month in result["months"]:
            if month["month"] not in p["missing_months"] or month["month"] in p["partial_months"]:
                continue
            values = [month[k] for k in ("month", "mean_c", "high_c", "rain_mm", "sample_days")] + [START, END, model]
            sql.append("INSERT INTO city_climate_months(city_id,month,mean_c,high_c,rain_mm,sample_days,period_start,period_end,model,source_id,checked_at) "
                       "SELECT id," + ",".join(q(v) for v in values) + ",(SELECT id FROM sources WHERE url=" + q(url) + ")," + q(CHECKED) +
                       " FROM cities WHERE " + city_where + " ON CONFLICT(city_id,month) DO UPDATE SET " +
                       ",".join(k + "=excluded." + k for k in ("mean_c", "high_c", "rain_mm", "sample_days", "period_start", "period_end", "model", "source_id", "checked_at")) +
                       " WHERE city_climate_months.mean_c IS NULL AND city_climate_months.high_c IS NULL AND city_climate_months.rain_mm IS NULL;")
    return "\n".join(sql) + "\n"


def collect(args):
    out = args.out
    (out / "climate").mkdir(parents=True, exist_ok=True)
    places = read_catalog(args.database, args.catalog)
    apply_resolutions(places, out)
    needed = [p for p in places if p["missing_months"]]
    order = {slug: i for i, slug in enumerate(args.priority or PRIORITY)}
    needed.sort(key=lambda p: order.get(p["slug"], 10000))
    results, stopped, fetched = [], None, 0
    for p in needed:
        record = dict(slug=p["slug"], place=p)
        target = out / "climate" / (p["slug"] + ".json")
        if p["latitude"] is None or p["longitude"] is None:
            record["error"] = "coordinate_unresolved"
        else:
            url = archive_url(p)
            record["url"] = url
            try:
                if target.exists():
                    envelope = json.loads(target.read_text())
                    if envelope["url"] != url or envelope["model"] != "ERA5":
                        raise ValueError("cache request identity mismatch")
                    data = envelope["response"]
                elif not args.fetch or stopped:
                    record["error"] = stopped or "not_collected"
                    results.append(record)
                    continue
                else:
                    if fetched >= args.max_fetch:
                        stopped = "batch_limit_reached"
                        record["error"] = stopped
                        results.append(record)
                        continue
                    # Requests are sequential and separated by >=9s to remain below
                    # the weighted minute limit. Never retry 429 in a tight loop.
                    wait = max(0, args.interval - (time.monotonic() - last_request)) if fetched else 0
                    if wait:
                        time.sleep(wait)
                    stopped = spend_request(out, url, REQUEST_WEIGHT)
                    if stopped:
                        record["error"] = stopped
                        results.append(record)
                        continue
                    last_request = time.monotonic()
                    fetched += 1
                    req = urllib.request.Request(url, headers={"User-Agent": "Roamorrow-climate-research/1.0"})
                    with urllib.request.urlopen(req, timeout=45) as response:
                        data = json.load(response)
                    aggregate(data)
                    envelope = dict(url=url, model="ERA5", checked_at=CHECKED, fetched_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                                    requested_coordinates=[p["latitude"], p["longitude"]], response=data)
                    target.write_text(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")))
                record["months"] = aggregate(data)
                record["raw_sha256"] = sha(target)
            except urllib.error.HTTPError as error:
                record["error"] = "HTTP " + str(error.code)
                if error.code == 429:
                    stopped = "upstream_429_stop"
            except Exception as error:
                record["error"] = str(error)[:250]
        results.append(record)
        if "months" in record:
            print(json.dumps(dict(slug=p["slug"], collected=sum("months" in r for r in results), fetched=fetched)), flush=True)
    successful = [r for r in results if "months" in r]
    summary = dict(checked_at=CHECKED, period_start=START, period_end=END, model="ERA5", timezone="UTC",
                   input_database_sha256=sha(args.database), input_catalog_sha256=sha(args.catalog),
                   catalog_cities=len(places), before_complete_cities=len(places) - len(needed), missing_cities=len(needed),
                   verified_backfill_cities=len(successful), verified_backfill_months=sum(len(p["missing_months"]) - len(p["partial_months"]) for p in (r["place"] for r in successful)),
                   after_complete_cities=len(places) - len(needed) + sum(not r["place"]["partial_months"] for r in successful),
                   fetched_this_run=fetched, request_weight=REQUEST_WEIGHT, stopped=stopped,
                   unresolved_coordinates=[p["slug"] for p in places if p["latitude"] is None],
                   new_location_records=[r["slug"] for r in successful if r["place"].get("location_new")],
                   remaining=[dict(slug=r["slug"], reason=r["error"]) for r in results if "error" in r],
                   partial_existing_rows=[dict(slug=p["slug"], months=p["partial_months"]) for p in places if p["partial_months"]],
                   methodology="1096 UTC daily ERA5 reanalysis estimates. Calendar-month mean of daily mean/max temperature; calendar-month precipitation sum divided by 3 years. Not a 30-year normal or a station observation.")
    (out / "backfill.sql").write_text(make_sql(results))
    (out / "verified-months.json").write_text(json.dumps(successful, ensure_ascii=False, indent=2) + "\n")
    (out / "report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in summary.items() if k not in ("remaining", "methodology")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / ".data/release/published.sqlite")
    parser.add_argument("--catalog", type=Path, default=ROOT / "public/published-pages/rankings.json")
    parser.add_argument("--out", type=Path, default=ROOT / ".data/climate-completion")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--max-fetch", type=int, default=57)
    parser.add_argument("--interval", type=float, default=9)
    parser.add_argument("--priority", nargs="*")
    args = parser.parse_args()
    if args.interval < 9:
        parser.error("--interval must be >=9 seconds for weighted-call rate limits")
    collect(args)
