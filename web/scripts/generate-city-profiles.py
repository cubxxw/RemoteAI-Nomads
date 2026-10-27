#!/usr/bin/env python3
"""Collect public city evidence, then build deterministic, source-backed profiles.

Run from any directory:
  python3 web/scripts/generate-city-profiles.py collect
  python3 web/scripts/generate-city-profiles.py build
  python3 web/scripts/generate-city-profiles.py check

Collection is opt-in; build/check are offline. Collection writes only the research
cache. It never writes the catalog, database, climate, costs, or published pages.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import json
import math
import pathlib
import re
import sqlite3
import sys
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".data/city-profile-research"
OUT = ROOT / "web/public/city-profiles"
RANKINGS = ROOT / "web/public/published-pages/rankings.json"
EDITORIAL = ROOT / "web/scripts/city-profile-editorial.json"
DB = ROOT / "web/.data/release/published.sqlite"
DATE = dt.date.today().isoformat()
UA = "RoamorrowCityProfiles/1.0 (public geography research; source cache)"
_NETWORK_LOCK = threading.Lock()
_LAST_FETCH = 0
_RATE_LIMITED = threading.Event()
CLDR = "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/"
CLDR_URLS = {
    "territory-info": CLDR + "cldr-core/supplemental/territoryInfo.json",
    "currency-data": CLDR + "cldr-core/supplemental/currencyData.json",
    "language-names": CLDR + "cldr-localenames-full/main/zh/languages.json",
    "currency-names": CLDR + "cldr-numbers-full/main/zh/currencies.json",
}
ALIASES = {
    "sliema": "Sliema", "lagos-algarve": "Lagos, Portugal", "dali": "Dali City",
    "taitung": "Taitung City", "anji": "Anji County", "tripoli": "Tripoli, Libya",
    "georgetown": "Georgetown, Guyana", "torshavn": "Tórshavn", "lome": "Lomé",
    "noumea": "Nouméa", "saint-denis": "Saint-Denis, Réunion",
    "luxembourg": "Luxembourg City", "san-juan": "San Juan, Puerto Rico",
    "kingstown": "Kingstown", "saint-george-s": "St. George's, Grenada",
    "george-town": "George Town, Cayman Islands", "kingston": "Kingston, Jamaica",
    "san-marino": "City of San Marino", "djibouti": "Djibouti City",
    "cordoba": "Córdoba, Argentina", "zanzibar": "Zanzibar City",
    "merida": "Mérida, Yucatán", "san-jose": "San José, Costa Rica",
    "san-juan-pr": "San Juan, Puerto Rico", "cuenca": "Cuenca, Ecuador",
    "victoria": "Victoria, Seychelles", "antigua": "Antigua Guatemala",
    "new-york": "New York City", "oaxaca": "Oaxaca City", "austin": "Austin, Texas",
    "macao": "Macau", "malacca": "Malacca City", "wrocaw": "Wrocław",
    "santa-cruz-de-tenerife": "Santa Cruz de Tenerife", "las-palmas": "Las Palmas",
    "goa": "Goa", "krabi": "Krabi", "jeju": "Jeju City", "ella": "Ella, Sri Lanka",
    "ahangama-weligama": "Weligama", "siargao": "Siargao",
    "kuta-lombok": "Kuta, Lombok", "okinawa-naha": "Naha", "koh-phangan": "Ko Pha-ngan",
    "phuket": "Phuket (city)", "langkawi": "Langkawi", "cebu": "Cebu City",
    "ponta-do-sol": "Ponta do Sol, Madeira", "nuku-alofa": "Nukuʻalofa",
    "n-djamena": "N'Djamena", "male": "Malé", "daegu": "Daegu",
}
# Some published locations represent an island, county, or a group of towns.
# Their coordinates are still checked, but a larger radius is explicit here.
REGIONAL_SCOPES = {
    "penang": 90, "gozo": 40, "lanzarote": 80, "goa": 100,
    "anji": 60, "siargao": 70, "langkawi": 60, "koh-phangan": 40,
    "sliema": 15, "agadir": 45, "ahangama-weligama": 40, "kuta-lombok": 80,
    "santa-cruz-de-tenerife": 100, "jeju": 80, "phuket": 60,
}


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429:
                _RATE_LIMITED.set()
                raise RuntimeError(f"provider rate limit; stopped collection; Retry-After={error.headers.get('Retry-After', 'unspecified')}") from error
            if attempt == 2:
                raise
            time.sleep(2 + attempt)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


class ArticleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("p", "div", "li", "h1", "h2", "h3", "tr", "td", "th", "br"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1
        elif tag in ("p", "li", "h1", "h2", "h3", "tr", "td", "th"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def collect_html_city(city, refresh=False):
    """Collect the public article directly; never auto-switch endpoints on errors."""
    global _LAST_FETCH
    path = CACHE / "sources/cities" / (city["slug"] + ".json")
    if path.exists() and not refresh:
        return {"slug": city["slug"], "status": "cached"}
    title = ALIASES.get(city["slug"], city["nameEn"])
    url = "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
    try:
        if _RATE_LIMITED.is_set():
            return {"slug": city["slug"], "status": "skipped", "reason": "provider rate limit; cached evidence preserved"}
        # Respect a global request cadence even with concurrent parsing.
        with _NETWORK_LOCK:
            wait = 1.1 - (time.monotonic() - _LAST_FETCH)
            if wait > 0:
                time.sleep(wait)
            if _RATE_LIMITED.is_set():
                return {"slug": city["slug"], "status": "skipped", "reason": "provider rate limit; cached evidence preserved"}
            _LAST_FETCH = time.monotonic()
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as response:
                raw = response.read().decode("utf-8")
                final_url = response.geturl()
        except urllib.error.HTTPError as error:
            if error.code == 429:
                _RATE_LIMITED.set()
            raise
        parser = ArticleText()
        parser.feed(raw)
        text = "\n".join(" ".join(line.split()) for line in "".join(parser.parts).splitlines() if line.strip())
        geo = re.search(r'<span[^>]*class="geo"[^>]*>([^<]+)', raw)
        if not geo:
            raise ValueError("article has no decimal coordinates; explicit identity review needed")
        coords = [float(v.strip()) for v in html.unescape(geo.group(1)).split(";")]
        km = validate_identity(city, {"type": "standard", "coordinates": {"lat": coords[0], "lon": coords[1]}})
        revision = re.search(r'(?:oldid=|revision/)(\d+)', raw)
        wikidata = re.search(r'(?:wikidata\.org/(?:wiki/)?|wikibase_item[\": ]+)(Q\d+)', raw)
        payload = {"retrievedAt": DATE, "sourceType": "secondary-encyclopedia", "title": title,
                   "url": final_url, "revision": revision.group(1) if revision else None,
                   "wikidataId": wikidata.group(1) if wikidata else None,
                   "coordinates": {"lat": coords[0], "lon": coords[1]}, "catalogDistanceKm": km,
                   "catalogCountryCode": city["countryCode"], "summary": text[:1800], "text": text,
                   "sha256": hashlib.sha256(text.encode()).hexdigest(), "license": "CC BY-SA; see source article history for contributors"}
        write(path, payload)
        return {"slug": city["slug"], "status": "collected", "km": km, "chars": len(text)}
    except Exception as error:
        return {"slug": city["slug"], "status": "error", "title": title, "error": str(error)}


def norm(text):
    text = "".join(c for c in unicodedata.normalize("NFKD", text).casefold() if not unicodedata.combining(c))
    return " ".join(text.split())


def distance_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def validate_identity(city, summary):
    """Reject homonyms and disambiguations instead of silently publishing them."""
    if summary.get("type") != "standard":
        raise ValueError("not a standard encyclopedia city/region article")
    coords = summary.get("coordinates")
    if not coords:
        raise ValueError("source has no coordinates; requires explicit researched override")
    if city.get("lat") is None or city.get("lon") is None:
        raise ValueError("catalog coordinates unavailable; requires explicit reviewed identity")
    km = distance_km((city["lat"], city["lon"]), (coords["lat"], coords["lon"]))
    limit = REGIONAL_SCOPES.get(city["slug"], 35)
    if km > limit:
        raise ValueError(f"identity mismatch: {km:.1f}km from catalog (limit {limit}km)")
    return round(km, 2)


def collect(args):
    dates_path = CACHE / "source-dates.json"
    dates = read(dates_path) if dates_path.exists() else {}
    for key, url in CLDR_URLS.items():
        path = CACHE / "sources" / (key + ".json")
        if args.refresh or not path.exists():
            write(path, fetch_json(url))
            dates[key] = DATE
    write(dates_path, dates)
    cities = read(RANKINGS)
    if args.slug:
        cities = [c for c in cities if c["slug"] in args.slug]
    results = []
    pending = []
    for city in cities:
        if not args.refresh and (CACHE / "sources/cities" / (city["slug"] + ".json")).exists():
            results.append({"slug": city["slug"], "status": "cached"})
        else:
            pending.append(city)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(lambda c: collect_html_city(c, args.refresh), pending):
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
    write(CACHE / "collection-report.json", {"date": DATE, "endpoint": "public Wikipedia article HTML", "results": results})
    return 1 if any(r["status"] in ("error", "skipped") for r in results) else 0


def supported(claim, evidence):
    """Every city-specific claim has a source token or an explicitly cited page."""
    tokens = claim.get("evidence", [])
    return bool(tokens) and all(norm(token) in norm(evidence) for token in tokens)


def cldr_rows(city, cached):
    code = city["countryCode"]
    languages = cached["territory-info"]["supplemental"]["territoryInfo"].get(code, {}).get("languagePopulation", {})
    labels = cached["language-names"]["main"]["zh"]["localeDisplayNames"]["languages"]
    official = [(key, val) for key, val in languages.items() if val.get("_officialStatus") in ("official", "de_facto_official")]
    official.sort(key=lambda pair: -float(pair[1].get("_populationPercent", 0)))
    rows = []
    if official:
        rows.append({"label": "官方语言", "value": "、".join(labels.get(key.replace("_", "-"), labels.get(key.split("_")[0], key)) for key, _ in official[:3]),
                     "note": "国家或地区口径；Unicode CLDR，不表示全体居民的日常用语"})
    regions = cached["currency-data"]["supplemental"]["currencyData"]["region"]
    curr_labels = cached["currency-names"]["main"]["zh"]["numbers"]["currencies"]
    current = []
    as_of = cached["sourceDates"].get("currency-data", cached["cldrRetrievedAt"])
    for item in regions.get(code, []):
        for curr, info in item.items():
            if info.get("_tender", "true") == "false":
                continue
            if info.get("_from", "0000") <= as_of and info.get("_to", "9999") >= as_of:
                current.append(curr)
    if current:
        rows.append({"label": "货币", "value": " / ".join(f"{curr_labels.get(c, {}).get('displayName', c)} {c}" for c in current[:2]),
                     "note": "国家或地区流通货币；Unicode CLDR"})
    if city.get("timeZone"):
        location = cached.get("locationEvidence", {}).get(city["slug"], {})
        note = "GeoNames 城市坐标匹配；夏令时以当地当日为准"
        if location.get("url", "").startswith("https://geocoding-api.open-meteo.com/"):
            note = "公开地理数据中的目的地代表点；夏令时以当地当日为准"
        rows.append({"label": "时区", "value": city["timeZone"], "note": note})
    return rows


def baseline_sources(city, country, cached):
    location = cached.get("locationEvidence", {}).get(city["slug"], {})
    location_source = {"title": "GeoNames · 城市坐标与时区", "url": "https://download.geonames.org/export/dump/cities15000.zip", "date": city.get("checkedAt", "2026-10-17")}
    if location:
        location_source["url"] = location["url"]
        location_source["date"] = location["checked_at"][:10]
        if location["url"].startswith("https://geocoding-api.open-meteo.com/"):
            location_source["title"] = "Open-Meteo 地名检索 · 目的地坐标与时区"
        elif "download.geonames.org" not in location["url"]:
            location_source["title"] = "公开地理资料 · 目的地坐标与时区"
    return [
        location_source,
        {"title": "Unicode CLDR · 国家或地区语言资料", "url": CLDR_URLS["territory-info"], "date": cached["sourceDates"].get("territory-info", cached["cldrRetrievedAt"])},
        {"title": "Unicode CLDR · 流通货币", "url": CLDR_URLS["currency-data"], "date": cached["sourceDates"].get("currency-data", cached["cldrRetrievedAt"])},
        {"title": "国家或地区目录", "url": country["catalog_source"], "date": country["checked_at"]},
    ]


def build_profile(city, country, cached, editorial, source):
    slug = city["slug"]
    coordinates = None
    if city.get("lat") is not None and city.get("lon") is not None:
        coordinates = f"{abs(city['lat']):.2f}°{'N' if city['lat'] >= 0 else 'S'} / {abs(city['lon']):.2f}°{'E' if city['lon'] >= 0 else 'W'}"
    country_label = cached.get("countryDisplayNames", {}).get(city["countryCode"], city["country"])
    profile = {"schemaVersion": 1, "slug": slug, "name": city["name"], "nameEn": city["nameEn"],
               "tagline": "", "tags": [],
               "geography": [{"label": "国家 / 地区", "value": country_label}],
               "statistics": cldr_rows(city, cached), "landmarks": [], "culture": [],
               "sources": baseline_sources(city, country, cached)}
    if coordinates:
        note = "城市参考点；不代表行政边界"
        if cached.get("locationEvidence", {}).get(slug, {}).get("url", "").startswith("https://geocoding-api.open-meteo.com/"):
            note = "目的地代表点；不代表完整行政区或每个地点"
        profile["geography"].append({"label": "地理坐标", "value": coordinates, "note": note})
    evidence = source.get("text", "") if source else ""
    if source:
        profile["sources"].insert(0, {"title": f"维基百科 · {source['title']}（二手参考）", "url": source["url"], "date": source["retrievedAt"]})
    dropped = []
    for field in ("tagline", "tags", "geography", "statistics", "landmarks", "culture"):
        claims = editorial.get(field, [])
        if field in ("tagline", "tags"):
            claims = [claims] if claims else []
        for claim in claims:
            claim_evidence = evidence
            if claim.get("sourceKey"):
                extra = cached.get("editorialSources", {}).get(claim["sourceKey"])
                if extra is None:
                    extra = read(CACHE / "sources" / (claim["sourceKey"] + ".json"))
                claim_evidence = extra["text"]
            if not supported(claim, claim_evidence):
                dropped.append({"field": field, "claim": claim, "reason": "evidence token missing from retrieved source"})
                continue
            if claim.get("sourceKey"):
                public_source = {"title": extra["title"], "url": extra["url"], "date": extra["retrievedAt"]}
                if public_source not in profile["sources"]:
                    profile["sources"].insert(0, public_source)
            if field == "tagline":
                profile[field] = claim["value"]
            elif field == "tags":
                profile[field] = claim["value"]
            else:
                profile[field].append({k: v for k, v in claim.items() if k not in ("evidence", "sourceKey")})
    if not profile["tagline"]:
        profile["tagline"] = f"{country_label} · {city['nameEn']}"
    if not profile["tags"]:
        profile["tags"] = [city["region"], country_label]
    return profile, dropped


def validate_profile(profile):
    required = {"schemaVersion", "slug", "name", "nameEn", "tagline", "tags", "geography", "statistics", "landmarks", "culture", "sources"}
    if set(profile) != required or profile["schemaVersion"] != 1:
        raise ValueError("invalid profile schema")
    for field in ("name", "nameEn", "tagline"):
        if not isinstance(profile[field], str) or not profile[field].strip():
            raise ValueError(f"empty {field}")
    for row in profile["statistics"]:
        if any(word in row["label"].lower() for word in ("人口", "面积", "gdp", "生产总值")):
            if not re.search(r"20\d\d|19\d\d", row.get("note", "")) or not any(w in row.get("note", "") for w in ("市域", "市区", "都会区", "行政区", "城市", "全市", "都市区", "县域")):
                raise ValueError("numeric city statistics require year and administrative scope")
    if any(word in json.dumps(profile, ensure_ascii=False) for word in ("待补", "待完善", "AI 生成", "AI创作", "成本指标较高")):
        raise ValueError("placeholder or creation-method branding in profile")
    if len(profile["landmarks"]) > 2:
        raise ValueError("share profile supports at most two landmarks")
    for source in profile["sources"]:
        if not source["url"].startswith("https://") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", source["date"]):
            raise ValueError("invalid source URL/date")


def build(args):
    cached = {key: read(CACHE / "sources" / (key + ".json")) for key in CLDR_URLS}
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    countries = {r["id"]: dict(r) for r in con.execute("SELECT * FROM countries")}
    cached["locationEvidence"] = {r["slug"]: dict(r) for r in con.execute("SELECT c.slug, l.checked_at, s.url FROM city_locations l JOIN cities c ON c.id=l.city_id JOIN sources s ON s.id=l.source_id")}
    con.close()
    editorial_document = read(EDITORIAL)
    editorial = editorial_document["cities"]
    cached["editorialSources"] = editorial_document["sources"]
    cached["countryDisplayNames"] = editorial_document.get("countryDisplayNames", {})
    cached["cldrRetrievedAt"] = editorial_document["cldrRetrievedAt"]
    dates_path = CACHE / "source-dates.json"
    cached["sourceDates"] = read(dates_path) if dates_path.exists() else {}
    report = {"date": DATE, "cities": 0, "withLocalTagline": 0, "withLandmark": 0, "withTwoLandmarks": 0,
              "withCulture": 0, "withFood": 0, "withScopedNumericStats": 0, "withEncyclopediaEvidence": 0,
              "missingLocalIdentity": [], "missingLandmarks": [], "missingCulture": [], "droppedClaims": []}
    validated_profiles = []
    for city in read(RANKINGS):
        slug = city["slug"]
        country_label = cached["countryDisplayNames"].get(city["countryCode"], city["country"])
        path = CACHE / "sources/cities" / (slug + ".json")
        source = read(path) if path.exists() else None
        profile, dropped = build_profile(city, countries[city["countryId"]], cached, editorial.get(slug, {}), source)
        validate_profile(profile)
        report["cities"] += 1
        report["withEncyclopediaEvidence"] += bool(source)
        report["withLocalTagline"] += profile["tagline"] != f"{country_label} · {city['nameEn']}"
        report["withLandmark"] += bool(profile["landmarks"])
        report["withTwoLandmarks"] += len(profile["landmarks"]) == 2
        report["withCulture"] += bool(profile["culture"])
        report["withFood"] += any("吃" in r["label"] or "食" in r["label"] for r in profile["culture"])
        report["withScopedNumericStats"] += any(any(w in r["label"] for w in ("人口", "面积", "GDP")) for r in profile["statistics"])
        if profile["tagline"] == f"{country_label} · {city['nameEn']}":
            report["missingLocalIdentity"].append(slug)
        if not profile["landmarks"]:
            report["missingLandmarks"].append(slug)
        if not profile["culture"]:
            report["missingCulture"].append(slug)
        report["droppedClaims"].extend({"slug": slug, **d} for d in dropped)
        if args.command == "check":
            if not (OUT / (slug + ".json")).exists() or read(OUT / (slug + ".json")) != profile:
                raise ValueError(f"profile out of date: {slug}; run build")
        else:
            validated_profiles.append(profile)
    if args.command != "check":
        # Validate the complete collection before replacing any published file.
        for profile in validated_profiles:
            write(OUT / (profile["slug"] + ".json"), profile)
        write(CACHE / "coverage.json", report)
    print(json.dumps({k: v for k, v in report.items() if not isinstance(v, list)}, ensure_ascii=False, indent=2))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("collect", "build", "check"))
    parser.add_argument("--refresh", action="store_true", help="explicitly re-fetch cached public sources")
    parser.add_argument("--slug", action="append", help="collect only the specified slug (repeatable)")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    return collect(args) if args.command == "collect" else build(args)


if __name__ == "__main__":
    sys.exit(main())
