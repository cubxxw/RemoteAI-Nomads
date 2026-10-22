"""Regression tests for structural validation, traceability and review reminders."""

import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date


CHECKER = Path(__file__).resolve().parents[1] / "scripts" / "check_data.py"
AS_OF = date(2026, 10, 22)


def sample_data():
    sources = {
        "schema_version": 1, "retrieved_on": "2026-10-14", "scope_note": "Public evidence",
        "sources": [{
            "id": "S1", "platform": "web", "url": "https://example.org/price",
            "published_at": "2022-08-05T13:22:01+00:00", "retrieved_on": "2026-10-14",
            "author": None, "read_scope": "Price page", "editorial_summary": "Desk only",
            "use": "used_with_limits",
        }],
    }
    destinations = {
        "schema_version": 2, "updated_on": "2026-10-14", "recommendations_are": "Conditional advice",
        "secondary_candidates": ["Elsewhere"],
        "destinations": [{
            "id": "place", "name": "Place", "country": "Country", "timezone": "Asia/Bangkok",
            "recommendation_for": "2026-10_to_2026-12", "seasonal_choice": "Autumn",
            "areas_to_compare": "Centre", "good_fit": "Work", "caveats": "Check the room",
            "source_ids": ["S1"], "monthly_total_budget": None, "budget_gap": "No complete budget",
            "price_observations": [{
                "amount": 0, "currency": "USD", "period": "day", "scope": "Desk only",
                "source_id": "S1", "source_date": "2026-10-14", "source_date_kind": "checked_on",
                "not_a_city_average": True,
            }],
        }],
    }
    return destinations, sources


class DataValidationTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(CHECKER.is_file(), "data checker has not been implemented")
        spec = importlib.util.spec_from_file_location("check_data", CHECKER)
        self.checker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.checker)
        self.destinations, self.sources = sample_data()
        self.destination = self.destinations["destinations"][0]
        self.source = self.sources["sources"][0]
        self.price = self.destination["price_observations"][0]

    def errors(self):
        return self.checker.validate_data(self.destinations, self.sources, AS_OF)

    def assert_error(self, fragment):
        errors = self.errors()
        self.assertTrue(any(fragment in error for error in errors), errors)

    def test_valid_data_preserves_zero_price_and_unknown_budget(self):
        self.assertEqual(self.errors(), [])

    def test_price_must_name_a_source_listed_for_its_destination(self):
        del self.price["source_id"]
        self.assert_error("source_id")
        self.price["source_id"] = "missing"
        self.assert_error("source_id")
        self.sources["sources"].append(dict(self.source, id="S2"))
        self.price["source_id"] = "S2"
        self.assert_error("source_ids")

    def test_destination_source_references_must_exist(self):
        self.destination["source_ids"] = ["missing"]
        self.assert_error("missing")

    def test_destination_source_references_must_not_repeat(self):
        self.destination["source_ids"] = ["S1", "S1"]
        self.assert_error("duplicate source id S1")

    def test_discovery_excluded_and_counterexample_sources_cannot_support_prices(self):
        for use in ("discovery_only", "excluded", "counterexample_only", "unknown"):
            with self.subTest(use=use):
                self.source["use"] = use
                self.assert_error("use")

    def test_prices_require_finite_nonnegative_numbers_and_reject_bools(self):
        for amount in (True, False, -1, float("nan"), float("inf"), -float("inf"), "20", None):
            with self.subTest(amount=amount):
                self.price["amount"] = amount
                self.assert_error("amount")

    def test_currency_requires_exactly_three_uppercase_letters(self):
        for currency in ("usd", "US", "USDD", "123", True):
            with self.subTest(currency=currency):
                self.price["currency"] = currency
                self.assert_error("currency")

    def test_price_scope_and_average_marker_are_required(self):
        for field, value in (("scope", " "), ("period", ""), ("not_a_city_average", False),
                             ("not_a_city_average", 1)):
            with self.subTest(field=field, value=value):
                original = self.price[field]
                self.price[field] = value
                self.assert_error(field)
                self.price[field] = original

    def test_price_date_kind_selects_published_day_or_checked_day(self):
        self.price.update(source_date_kind="published_on", source_date="2022-08-05")
        self.assertEqual(self.errors(), [])
        self.price["source_date"] = "2026-10-14"
        self.assert_error("source_date")
        self.price.update(source_date_kind="checked_on", source_date="2022-08-05")
        self.assert_error("source_date")
        self.price["source_date_kind"] = "made_up"
        self.assert_error("source_date_kind")

    def test_published_price_requires_an_actual_publication_date(self):
        self.price.update(source_date_kind="published_on", source_date="2022-08-05")
        self.source["published_at"] = None
        self.assert_error("published_at")

    def test_published_timestamps_accept_existing_basic_utc_offsets_on_python310(self):
        self.source["published_at"] = "2022-08-05T13:22:01.251000+0000"
        self.price.update(source_date_kind="published_on", source_date="2022-08-05")
        self.assertEqual(self.errors(), [])

    def test_invalid_dates_and_reverse_publication_order_are_errors(self):
        for field, value in (("retrieved_on", "2026-02-30"), ("published_at", "yesterday"),
                             ("published_at", "2026-10-15T00:00:00+00:00")):
            with self.subTest(field=field):
                original = self.source[field]
                self.source[field] = value
                self.assert_error(field)
                self.source[field] = original
        self.price["source_date"] = "20261014"
        self.assert_error("source_date")

    def test_future_fact_dates_are_errors_but_future_review_dates_are_valid(self):
        self.source.update(review_after="2026-11-01", review_reason="Recheck advertised price")
        self.assertEqual(self.errors(), [])
        self.destinations["updated_on"] = "2026-10-23"
        self.assert_error("updated_on")

    def test_comments_review_day_must_be_iso_and_not_after_retrieval(self):
        self.source["comments_reviewed_on"] = "2026-10-07"
        self.assertEqual(self.errors(), [])
        for value in ("2026-10-15", "last week", None):
            with self.subTest(value=value):
                self.source["comments_reviewed_on"] = value
                self.assert_error("comments_reviewed_on")

    def test_comments_cannot_be_reviewed_before_the_post_was_published(self):
        self.source["comments_reviewed_on"] = "2022-08-04"
        self.assert_error("comments_reviewed_on")
        self.source["comments_reviewed_on"] = "2022-08-05"
        self.assertEqual(self.errors(), [])
        self.source["published_at"] = None
        self.source["comments_reviewed_on"] = "2022-08-04"
        self.assertEqual(self.errors(), [])

    def test_top_source_retrieval_is_a_batch_date_not_each_records_ceiling(self):
        self.sources["retrieved_on"] = "2026-10-07"
        self.assertEqual(self.errors(), [])

    def test_recommendation_windows_must_be_valid_and_ordered(self):
        for window in ("2026-13_to_2027-01", "2026-12_to_2026-10", "Autumn", 2):
            with self.subTest(window=window):
                self.destination["recommendation_for"] = window
                self.assert_error("recommendation_for")

    def test_timezone_must_be_an_iana_zone(self):
        for timezone in ("Mars/Olympus", "../Asia/Bangkok", "", 8):
            with self.subTest(timezone=timezone):
                self.destination["timezone"] = timezone
                self.assert_error("timezone")

    def test_null_budget_requires_gap_and_numeric_budget_rejects_invalid_numbers(self):
        del self.destination["budget_gap"]
        self.assert_error("budget_gap")
        self.destination["monthly_total_budget"] = 700
        self.assertEqual(self.errors(), [])
        for amount in (True, -1, float("inf"), "700"):
            with self.subTest(amount=amount):
                self.destination["monthly_total_budget"] = amount
                self.assert_error("monthly_total_budget")

    def test_duplicate_record_ids_are_errors(self):
        self.destinations["destinations"].append(copy.deepcopy(self.destination))
        self.sources["sources"].append(copy.deepcopy(self.source))
        errors = "\n".join(self.errors())
        self.assertIn("duplicate", errors)
        self.assertIn("destinations[1].id", errors)
        self.assertIn("sources[1].id", errors)

    def test_malformed_evidence_urls_are_rejected(self):
        for url in ("https://example.org:invalid/price", "https://example.org:70000/price",
                    "https://example.org/a b", "https://exa\nmple.org/price"):
            with self.subTest(url=url):
                self.source["url"] = url
                self.assert_error("url")

    def test_evidence_urls_must_not_embed_credentials(self):
        for url in ("https://reader:secret@example.org/price",
                    "https://reader@example.org/price", "https://@example.org/price"):
            with self.subTest(url=url):
                self.source["url"] = url
                self.assert_error("url: must not contain embedded credentials")

    def test_required_metadata_and_text_fields_are_checked(self):
        for row, field in ((self.destinations, "recommendations_are"), (self.sources, "scope_note"),
                           (self.destination, "name"), (self.source, "read_scope"),
                           (self.source, "url"), (self.source, "author")):
            with self.subTest(field=field):
                original = row[field]
                row[field] = " "
                self.assert_error(field)
                row[field] = original
        self.destinations["schema_version"] = 1
        self.sources["schema_version"] = True
        self.assert_error("schema_version")

    def test_unknown_fields_do_not_silently_disable_validation(self):
        for row, field in ((self.destinations, "update_on"), (self.sources, "retrieved_at"),
                           (self.destination, "sources_ids"), (self.source, "review_aftr"),
                           (self.price, "source_data_kind")):
            with self.subTest(field=field):
                row[field] = "2026-10-22"
                self.assert_error(f"{field}: unknown field")
                del row[field]

    def test_review_fields_require_valid_date_reason_and_order(self):
        for fields in ({"review_after": "soon", "review_reason": "Check"},
                       {"review_after": "2026-11-01"},
                       {"review_after": "2026-10-01", "review_reason": "Check"}):
            with self.subTest(fields=fields):
                self.source.pop("review_after", None)
                self.source.pop("review_reason", None)
                self.source.update(fields)
                self.assert_error("review_")

    def test_malformed_nested_structures_return_diagnostics_without_crashing(self):
        variants = [
            (None, self.sources), ([], self.sources), (self.destinations, None),
            (dict(self.destinations, destinations=[None, [], 4]), self.sources),
            (self.destinations, dict(self.sources, sources=[None, [], "source"])),
        ]
        for field, value in (("source_ids", [None, {}, []]), ("source_ids", "S1"),
                             ("price_observations", [None, [], 3]), ("price_observations", {})):
            broken = copy.deepcopy(self.destinations)
            broken["destinations"][0][field] = value
            variants.append((broken, self.sources))
        for destinations, sources in variants:
            with self.subTest(destinations=destinations, sources=sources):
                self.assertTrue(self.checker.validate_data(destinations, sources, AS_OF))
                self.assertIsInstance(self.checker.freshness_warnings(destinations, sources, AS_OF), list)

    def test_numeric_total_budget_requires_manual_evidence_review(self):
        self.destination["monthly_total_budget"] = 700
        self.assertEqual(self.errors(), [])
        warnings = self.checker.freshness_warnings(self.destinations, self.sources, AS_OF)
        self.assertTrue(any("place.monthly_total_budget" in item and "currency" in item
                            for item in warnings), warnings)

    def test_old_historical_publication_is_neither_error_nor_age_warning(self):
        self.price.update(source_date_kind="published_on", source_date="2022-08-05")
        self.assertEqual(self.errors(), [])
        self.assertEqual(self.checker.freshness_warnings(self.destinations, self.sources, AS_OF), [])

    def test_expired_review_is_only_a_warning_and_includes_its_reason(self):
        self.source.update(review_after="2026-10-22", review_reason="Recheck seasonal access")
        self.assertEqual(self.errors(), [])
        warnings = self.checker.freshness_warnings(self.destinations, self.sources, AS_OF)
        self.assertTrue(any("S1" in warning and "Recheck seasonal access" in warning for warning in warnings))

    def test_stale_update_and_expired_recommendation_are_only_warnings(self):
        future = date(2027, 1, 1)
        self.assertEqual(self.checker.validate_data(self.destinations, self.sources, future), [])
        warnings = "\n".join(self.checker.freshness_warnings(self.destinations, self.sources, future))
        self.assertIn("updated_on", warnings)
        self.assertIn("recommendation_for", warnings)


class DataCliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "data").mkdir()
        self.destinations, self.sources = sample_data()
        self.write_data()

    def write_data(self):
        for name, data in (("destinations.json", self.destinations),
                           ("sources-2026-10-14.json", self.sources)):
            (self.root / "data" / name).write_text(json.dumps(data), encoding="utf-8")

    def run_cli(self, script=CHECKER, *extra):
        return subprocess.run([sys.executable, str(script), "--as-of", "2026-10-22", *extra],
                              cwd=self.root, capture_output=True, text=True)

    def test_cli_valid_fixture_passes_and_warnings_do_not_fail(self):
        self.sources["sources"][0].update(review_after="2026-10-22", review_reason="Check rates")
        self.write_data()
        result = self.run_cli(CHECKER, "--root", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("WARNING", result.stdout + result.stderr)

    def test_cli_structural_error_exits_one_with_field_diagnostic(self):
        self.destinations["destinations"][0]["price_observations"][0]["amount"] = -20
        self.write_data()
        result = self.run_cli(CHECKER, "--root", str(self.root))
        self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
        self.assertIn("amount", result.stdout + result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_cli_missing_or_invalid_json_is_a_friendly_failure(self):
        path = self.root / "data" / "destinations.json"
        for invalid in (None, '{"destinations":', "\xff"):
            with self.subTest(invalid=invalid):
                if invalid is None:
                    path.unlink()
                else:
                    path.write_bytes(invalid.encode("latin1"))
                result = self.run_cli(CHECKER, "--root", str(self.root))
                self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
                self.assertIn("destinations.json", result.stderr + result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_cli_rejects_duplicate_json_keys_before_they_overwrite_evidence(self):
        for filename, original, duplicate in (
            ("destinations.json", '"schema_version": 2', '"schema_version": 1, "schema_version": 2'),
            ("destinations.json", '"amount": 0', '"amount": 99, "amount": 0'),
            ("sources-2026-10-14.json", '"use": "used_with_limits"',
             '"use": "excluded", "use": "used_with_limits"'),
            ("sources-2026-10-14.json", '"read_scope": "Price page"',
             '"read_scope": "Summary only", "read_\\u0073cope": "Price page"'),
        ):
            with self.subTest(filename=filename, original=original):
                self.write_data()
                path = self.root / "data" / filename
                raw = path.read_text(encoding="utf-8")
                self.assertIn(original, raw)
                path.write_text(raw.replace(original, duplicate, 1), encoding="utf-8")
                result = self.run_cli(CHECKER, "--root", str(self.root))
                self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
                self.assertIn(filename, result.stderr)
                self.assertIn("duplicate JSON key", result.stderr)
                self.assertNotIn("Traceback", result.stderr)

    def test_cli_rejects_nonstandard_json_constants_in_any_field(self):
        # A numeric budget skips budget_gap semantics, so the loader must enforce JSON.
        self.destinations["destinations"][0]["monthly_total_budget"] = 700
        for constant in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(constant=constant):
                self.write_data()
                path = self.root / "data" / "destinations.json"
                raw = path.read_text(encoding="utf-8")
                path.write_text(raw.replace('"budget_gap": "No complete budget"',
                                            '"budget_gap": ' + constant), encoding="utf-8")
                result = self.run_cli(CHECKER, "--root", str(self.root))
                self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
                self.assertIn("non-standard JSON constant", result.stderr)
                self.assertIn("destinations.json", result.stderr)
                self.assertNotIn("Traceback", result.stderr)

    def test_cli_excessively_nested_json_is_a_friendly_failure(self):
        (self.root / "data" / "destinations.json").write_text("[" * 2000 + "]" * 2000)
        result = self.run_cli(CHECKER, "--root", str(self.root))
        self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
        # Some Python versions parse this depth and then reject the root array.
        self.assertIn("destinations", result.stderr + result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_default_root_is_relative_to_script_not_working_directory(self):
        self.assertTrue(CHECKER.is_file(), "data checker has not been implemented")
        script = self.root / "scripts" / "check_data.py"
        script.parent.mkdir()
        shutil.copyfile(CHECKER, script)
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        result = subprocess.run([sys.executable, str(script), "--as-of", "2026-10-22"],
                                cwd=elsewhere, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()
