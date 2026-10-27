"""Validation of source completeness and preservation boundaries for the backfill."""
import copy
import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result


base = module("climate_test_base", "complete-climate.py")
nasa = module("climate_test_nasa", "complete-climate-nasa.py")


def daily():
    return dict(daily={"time": base.DATES, "temperature_2m_mean": [20] * 1096,
                       "temperature_2m_max": [30] * 1096, "precipitation_sum": [1] * 1096},
                daily_units=dict(zip(base.VARIABLES, ("°C", "°C", "mm"))))


class ClimateTests(unittest.TestCase):
    def test_calendar_months_include_leap_day_and_rain_is_three_year_mean(self):
        rows = base.aggregate(daily())
        self.assertEqual(len(rows), 12)
        self.assertEqual(rows[1], dict(month=2, mean_c=20, high_c=30, rain_mm=28.33, sample_days=85))
        self.assertEqual(sum(r["sample_days"] for r in rows), 1096)

    def test_missing_or_misaligned_daily_values_are_never_estimated(self):
        for mutation in (lambda d: d["daily"]["temperature_2m_mean"].__setitem__(0, None),
                         lambda d: d["daily"]["precipitation_sum"].__setitem__(0, -999),
                         lambda d: d["daily"]["time"].pop(),
                         lambda d: d["daily"]["temperature_2m_max"].pop(),
                         lambda d: d["daily_units"].__setitem__("precipitation_sum", "inch")):
            data = copy.deepcopy(daily())
            mutation(data)
            with self.assertRaises(ValueError):
                base.aggregate(data)

    def test_nasa_metadata_units_and_missing_sentinel(self):
        source = dict(header=dict(time_standard="UTC", start="20230101", end="20251231", sources=["MERRA2", "POWER"]),
                      parameters={k: {"units": u} for k, u in zip(nasa.NASA_VARS, ("C", "C", "mm/day"))},
                      properties=dict(parameter={k: {d.replace("-", ""): value for d in base.DATES}
                                                 for k, value in zip(nasa.NASA_VARS, (20, 30, 1))}))
        self.assertEqual(nasa.aggregate_nasa(source), base.aggregate(daily()))
        for mutation in (lambda d: d["header"].__setitem__("time_standard", "LST"),
                         lambda d: d["header"].__setitem__("sources", ["GEOSIT"]),
                         lambda d: d["parameters"]["PRECTOTCORR"].__setitem__("units", "mm/hour"),
                         lambda d: d["properties"]["parameter"]["T2M"].__setitem__("20240229", -999)):
            changed = copy.deepcopy(source)
            mutation(changed)
            with self.assertRaises(ValueError):
                nasa.aggregate_nasa(changed)

    def test_native_grid_reuses_adjacent_destinations_and_wraps_longitude(self):
        self.assertEqual(nasa.grid(dict(latitude=18.44, longitude=-66.1)), nasa.grid(dict(latitude=18.45, longitude=-66.11)))
        self.assertEqual(nasa.grid(dict(latitude=0, longitude=180)), (0, -180))

    def test_sql_uses_url_identity_and_slug_country_preserves_existing_values(self):
        db = sqlite3.connect(":memory:")
        for path in ("0001_core.sql", "0002_rankings.sql"):
            db.executescript((SCRIPTS.parent / "migrations" / path).read_text())
        db.execute("INSERT INTO countries(id,iso2,name_zh,name_en,region,catalog_scope,catalog_source,checked_at) VALUES('BO','BO','玻利维亚','Bolivia','美洲','test','test','2026-10-27')")
        for ident, slug in (("different-id-from-cache", "la-paz"), ("do-not-touch", "other")):
            db.execute("INSERT INTO cities(id,country_id,slug,name_zh,name_en,region,budget_basis) VALUES(?,'BO',?,'城','city','美洲','test')", (ident, slug))
        url = "https://power.larc.nasa.gov/example"
        db.execute("INSERT INTO sources VALUES('existing-different-id',?,'NASA','original title','official','public','2020-01-01')", (url,))
        db.execute("INSERT INTO city_climate_months VALUES('different-id-from-cache',1,11,22,33,93,'old','old','existing','existing-different-id','old')")
        p = dict(slug="la-paz", country_id="BO", missing_months=list(range(1, 13)), partial_months=[])
        result = dict(place=p, model="MERRA-2", url=url, months=base.aggregate(daily()))
        sql = base.make_sql([result])
        db.executescript(sql)
        self.assertEqual(db.execute("SELECT mean_c,model FROM city_climate_months WHERE month=1").fetchone(), (11, "existing"))
        self.assertEqual(db.execute("SELECT count(*),count(distinct city_id) FROM city_climate_months").fetchone(), (12, 1))
        self.assertEqual(db.execute("SELECT source_id FROM city_climate_months WHERE month=2").fetchone()[0], "existing-different-id")
        self.assertEqual(db.execute("SELECT title FROM sources WHERE id='existing-different-id'").fetchone()[0], "original title")
        db.executescript(sql)
        self.assertEqual(db.execute("SELECT count(*) FROM city_climate_months").fetchone()[0], 12)

    def test_weighted_budget_counts_attempts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            self.assertIsNone(base.spend_request(path, "https://example.org", 78.3, minute=100))
            self.assertEqual(base.spend_request(path, "https://example.org/next", 78.3, minute=100), "minute_budget_exhausted")


if __name__ == "__main__":
    unittest.main()
