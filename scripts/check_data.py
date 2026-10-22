#!/usr/bin/env python3
"""Check local guide data and price provenance using only Python's standard library.

Structural errors fail validation. Review reminders never reject historical evidence;
passing this check does not verify external pages or the truth of their claims.
"""

import argparse
from datetime import date, datetime
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _day(value):
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    return None


def _published_day(value):
    if not isinstance(value, str):
        return None
    if len(value) == 10:
        return _day(value)
    if not re.match(r"\d{4}-\d{2}-\d{2}T", value):
        return None
    # Python 3.10 needs a colon in ISO offsets such as the archive's +0000.
    value = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", value)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _window(value):
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"(\d{4}-\d{2})_to_(\d{4}-\d{2})", value)
    if match:
        start, end = (_day(part + "-01") for part in match.groups())
        if start and end and start <= end:
            return start, end
    return None


def _amount(value):
    return type(value) in (int, float) and value >= 0 and (type(value) is int or math.isfinite(value))


def _rows(document, key):
    value = document.get(key) if isinstance(document, dict) else None
    return value if isinstance(value, list) else []


def _unique_object(pairs):
    """Reject duplicate decoded keys before JSON silently overwrites evidence."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _reject_constant(value):
    raise ValueError(f"non-standard JSON constant {value!r}")


def validate_data(destinations: dict, sources: dict, as_of: date) -> list[str]:
    """Return actionable structural errors; freshness is reported separately."""
    errors = []

    def error(path, message):
        errors.append(f"{path}: {message}")

    def text_fields(row, fields, path):
        for field in fields.split():
            if not _text(row.get(field)):
                error(f"{path}.{field}", "must be non-empty text")

    def known_fields(row, fields, path):
        allowed = set(fields.split())
        for field in row:
            if field not in allowed:
                error(f"{path}.{field}", "unknown field; define its meaning and validation first")

    def day_field(row, field, path, *, future=False):
        parsed = _day(row.get(field))
        if parsed is None:
            error(f"{path}.{field}", "must be an ISO date YYYY-MM-DD")
        elif not future and parsed > as_of:
            error(f"{path}.{field}", "must not be after --as-of")
        return parsed

    for document, name, version, top_date, top_text, records, optional in (
        (destinations, "destinations", 2, "updated_on", "recommendations_are", "destinations", "secondary_candidates"),
        (sources, "sources", 1, "retrieved_on", "scope_note", "sources", ""),
    ):
        if not isinstance(document, dict):
            error(name, "must be an object")
            continue
        known_fields(document, f"schema_version {top_date} {top_text} {records} {optional}", name)
        if type(document.get("schema_version")) is not int or document["schema_version"] != version:
            error(f"{name}.schema_version", f"must be {version}")
        day_field(document, top_date, name)
        text_fields(document, top_text, name)
        if not isinstance(document.get(records), list) or not document[records]:
            error(f"{name}.{records}", "must be a non-empty array")

    source_map, source_dates = {}, {}
    uses = {"used_with_limits", "discovery_only", "excluded", "counterexample_only"}
    for index, source in enumerate(_rows(sources, "sources")):
        path = f"sources[{index}]"
        if not isinstance(source, dict):
            error(path, "must be an object")
            continue
        known_fields(source, "id platform url published_at retrieved_on author read_scope editorial_summary "
                     "use comments_reviewed_on review_after review_reason", path)
        text_fields(source, "id platform url read_scope editorial_summary use", path)
        sid = source.get("id")
        if _text(sid):
            if sid in source_map:
                error(f"{path}.id", f"duplicate id {sid}")
            else:
                source_map[sid] = source
        use = source.get("use")
        if not isinstance(use, str) or use not in uses:
            error(f"{path}.use", "unknown source use")
        try:
            url = urlsplit(source.get("url", "")) if isinstance(source.get("url"), str) else None
            if (not url or url.scheme not in ("http", "https") or not url.hostname
                    or any(character.isspace() or ord(character) < 32 or ord(character) == 127
                           for character in source["url"])):
                error(f"{path}.url", "must be an absolute http(s) URL without whitespace or controls")
            if url and (url.username is not None or url.password is not None):
                error(f"{path}.url", "must not contain embedded credentials")
            if url:
                # urlsplit delays invalid/non-numeric port errors until this access.
                _ = url.port
        except ValueError:
            error(f"{path}.url", "invalid URL")
        if "author" not in source or (source["author"] is not None and not _text(source["author"])):
            error(f"{path}.author", "must be null or non-empty text")
        retrieved = day_field(source, "retrieved_on", path)
        published = _published_day(source.get("published_at"))
        if "published_at" not in source or (source["published_at"] is not None and published is None):
            error(f"{path}.published_at", "must be null or an ISO date/datetime")
        if published and (published > as_of or (retrieved and published > retrieved)):
            error(f"{path}.published_at", "must not be after retrieved_on or --as-of")
        if _text(sid) and sid not in source_dates:
            source_dates[sid] = {"published_on": published, "checked_on": retrieved}
        if "comments_reviewed_on" in source:
            reviewed = day_field(source, "comments_reviewed_on", path)
            if reviewed and retrieved and reviewed > retrieved:
                error(f"{path}.comments_reviewed_on", "must not be after retrieved_on")
            if reviewed and published and reviewed < published:
                error(f"{path}.comments_reviewed_on", "must not be before published_at day")
        if "review_after" in source or "review_reason" in source:
            review = day_field(source, "review_after", path, future=True)
            text_fields(source, "review_reason", path)
            if review and retrieved and review < retrieved:
                error(f"{path}.review_after", "must not be before retrieved_on")

    seen = set()
    for index, destination in enumerate(_rows(destinations, "destinations")):
        path = f"destinations[{index}]"
        if not isinstance(destination, dict):
            error(path, "must be an object")
            continue
        known_fields(destination, "id name country timezone recommendation_for seasonal_choice areas_to_compare "
                     "good_fit caveats source_ids monthly_total_budget budget_gap price_observations", path)
        text_fields(destination, "id name country timezone seasonal_choice areas_to_compare good_fit caveats", path)
        did = destination.get("id")
        if _text(did):
            if did in seen:
                error(f"{path}.id", f"duplicate id {did}")
            seen.add(did)
        try:
            if _text(destination.get("timezone")):
                ZoneInfo(destination["timezone"])
        except (ValueError, ZoneInfoNotFoundError):
            error(f"{path}.timezone", "must be a valid IANA timezone")
        if not _window(destination.get("recommendation_for")):
            error(f"{path}.recommendation_for", "must be an ordered YYYY-MM_to_YYYY-MM window")
        refs = destination.get("source_ids")
        if not isinstance(refs, list) or not refs:
            error(f"{path}.source_ids", "must be a non-empty array")
            refs = []
        seen_refs = set()
        for ref in refs:
            if _text(ref):
                if ref in seen_refs:
                    error(f"{path}.source_ids", f"duplicate source id {ref}")
                seen_refs.add(ref)
            source = source_map.get(ref) if _text(ref) else None
            if source is None:
                error(f"{path}.source_ids", f"unknown or invalid source id {ref!r}")
            elif source.get("use") != "used_with_limits":
                error(f"{path}.source_ids", f"source {ref} use must be used_with_limits")
        budget = destination.get("monthly_total_budget")
        if "monthly_total_budget" not in destination:
            error(f"{path}.monthly_total_budget", "required; use null when unknown")
        if budget is None:
            text_fields(destination, "budget_gap", path)
        elif not _amount(budget):
            error(f"{path}.monthly_total_budget", "must be null or a finite non-negative number, excluding bool")
        prices = destination.get("price_observations")
        if not isinstance(prices, list):
            error(f"{path}.price_observations", "must be an array")
            continue
        for price_index, price in enumerate(prices):
            ppath = f"{path}.price_observations[{price_index}]"
            if not isinstance(price, dict):
                error(ppath, "must be an object")
                continue
            known_fields(price, "amount currency period scope source_id source_date source_date_kind not_a_city_average", ppath)
            text_fields(price, "period scope source_id", ppath)
            if not _amount(price.get("amount")):
                error(f"{ppath}.amount", "must be a finite non-negative number, excluding bool")
            if not isinstance(price.get("currency"), str) or not re.fullmatch(r"[A-Z]{3}", price["currency"]):
                error(f"{ppath}.currency", "must be three uppercase ASCII letters")
            if price.get("not_a_city_average") is not True:
                error(f"{ppath}.not_a_city_average", "must be true")
            sid, kind = price.get("source_id"), price.get("source_date_kind")
            source = source_map.get(sid) if _text(sid) else None
            if source is None:
                error(f"{ppath}.source_id", "must reference an existing source")
            elif sid not in refs:
                error(f"{ppath}.source_id", "must be included in destination source_ids")
            if source and source.get("use") != "used_with_limits":
                error(f"{ppath}.source_id", "source use must be used_with_limits")
            observed = day_field(price, "source_date", ppath)
            if kind not in ("published_on", "checked_on"):
                error(f"{ppath}.source_date_kind", "must be published_on or checked_on")
            elif source:
                expected = source_dates[sid][kind]
                if expected is None or observed != expected:
                    field = "published_at" if kind == "published_on" else "retrieved_on"
                    error(f"{ppath}.source_date", f"must match source {sid}.{field} day")

    if isinstance(destinations, dict) and "secondary_candidates" in destinations:
        candidates = destinations["secondary_candidates"]
        if not isinstance(candidates, list) or any(not _text(value) for value in candidates):
            error("destinations.secondary_candidates", "must be an array of non-empty text")
    return errors


def freshness_warnings(destinations: dict, sources: dict, as_of: date) -> list[str]:
    """Flag review needs and unstructured budgets, never infer evidence validity."""
    warnings = []
    updated = _day(destinations.get("updated_on")) if isinstance(destinations, dict) else None
    if updated and (as_of - updated).days >= 30:
        warnings.append(f"destinations.updated_on {updated}: 30 days have elapsed; review the guide")
    for destination in _rows(destinations, "destinations"):
        if isinstance(destination, dict):
            if _amount(destination.get("monthly_total_budget")):
                warnings.append(
                    f"{destination.get('id')}.monthly_total_budget: numeric total has no structured "
                    "currency, coverage or direct provenance; manually review before publishing as a budget")
            window = _window(destination.get("recommendation_for"))
            if window and (as_of.year, as_of.month) > (window[1].year, window[1].month):
                warnings.append(f"{destination.get('id')}.recommendation_for {destination.get('recommendation_for')}: window expired")
    for source in _rows(sources, "sources"):
        if isinstance(source, dict):
            review = _day(source.get("review_after"))
            if review and review <= as_of:
                warnings.append(f"{source.get('id')}.review_after {review}: {source.get('review_reason', 'review required')}")
    return warnings


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args(argv)
    loaded = []
    for name in ("destinations.json", "sources-2026-10-14.json"):
        path = args.root / "data" / name
        try:
            loaded.append(json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object,
                                     parse_constant=_reject_constant))
        except (OSError, UnicodeError, ValueError, RecursionError) as exc:
            print(f"ERROR {path}: {exc}", file=sys.stderr)
            return 1
    errors = validate_data(*loaded, args.as_of)
    for error in errors:
        print(f"ERROR {error}", file=sys.stderr)
    for warning in freshness_warnings(*loaded, args.as_of):
        print(f"WARNING {warning}")
    if errors:
        return 1
    print(f"Data check passed ({len(_rows(loaded[0], 'destinations'))} destinations, {len(_rows(loaded[1], 'sources'))} sources).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
