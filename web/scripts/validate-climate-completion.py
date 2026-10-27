"""Apply only to an in-memory backup and prove completeness and preservation."""
import argparse
import hashlib
import importlib.util
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(database, out):
    original_hash = checksum(database)
    source = sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)
    db = sqlite3.connect(":memory:")
    source.backup(db)
    source.close()
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    before = {table: set(db.execute('SELECT * FROM "' + table + '"').fetchall()) for table in tables}
    db.executescript((out / "backfill.sql").read_text())
    after = {table: set(db.execute('SELECT * FROM "' + table + '"').fetchall()) for table in tables}
    allowed = {"sources", "city_locations", "city_climate_months"}
    for table in tables:
        if table not in allowed:
            assert before[table] == after[table], "Unrelated table changed: " + table
        else:
            assert before[table] <= after[table], "Existing record changed: " + table
    added = {table: len(after[table]) - len(before[table]) for table in allowed}
    db.executescript((out / "backfill.sql").read_text())
    for table in tables:
        assert after[table] == set(db.execute('SELECT * FROM "' + table + '"').fetchall()), "Not idempotent: " + table
    assert db.execute("PRAGMA foreign_key_check").fetchall() == [], "Broken foreign key"
    public = json.loads((ROOT / "public/published-pages/rankings.json").read_text())
    complete = 0
    for city in public:
        rows = db.execute("SELECT m.* FROM city_climate_months m JOIN cities c ON c.id=m.city_id WHERE c.slug=? AND c.country_id=? ORDER BY month", (city["slug"], city["countryId"])).fetchall()
        if len(rows) == 12 and all(all(r[i] is not None for i in (2, 3, 4)) for r in rows):
            complete += 1
            assert sum(r[5] for r in rows) == 1096
    report = json.loads((out / "report.json").read_text())
    assert report["after_complete_cities"] == complete
    assert report["input_database_sha256"] == original_hash
    assert checksum(database) == original_hash, "Input database changed"
    models = dict(db.execute("SELECT model,count(distinct city_id) FROM city_climate_months GROUP BY model").fetchall())
    result = dict(input_database_sha256=original_hash, sql_sha256=checksum(out / "backfill.sql"),
                  validation_target="in-memory backup only", existing_records_unchanged=True,
                  all_unrelated_tables_unchanged=True, recommendation_labels_unchanged=True,
                  idempotent=True, foreign_key_errors=0, added=added, complete_public_cities=complete,
                  catalog_cities=len(public), climate_rows=db.execute("SELECT count(*) FROM city_climate_months").fetchone()[0],
                  models=models, remaining=report["remaining"])
    (out / "validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / ".data/release/published.sqlite")
    parser.add_argument("--out", type=Path, default=ROOT / ".data/climate-completion")
    args = parser.parse_args()
    validate(args.database, args.out)
