#!/usr/bin/env python3
"""Build an isolated, sanitized initial publication snapshot. Never edits local D1."""
import argparse, hashlib, json, re, sqlite3
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument('--origin', required=True)
parser.add_argument('--source', type=Path)
parser.add_argument('--output', type=Path, default=Path('.data/release'))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
origin = args.origin.rstrip('/')
assert urlparse(origin).scheme == 'https' and not urlparse(origin).path, 'Use an HTTPS origin without a path'
files = list((root/'.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite'))
files = [p for p in files if p.name != 'metadata.sqlite']
assert args.source or len(files) == 1, 'Select the source D1 explicitly'
source_path = args.source or files[0]
source = sqlite3.connect(f'file:{source_path.resolve()}?mode=ro', uri=True)
snapshot = sqlite3.connect(':memory:'); source.backup(snapshot); source.close()
snapshot.row_factory = sqlite3.Row
out = root/args.output; out.mkdir(parents=True, exist_ok=True)
target_path = out/'published.sqlite'
assert not target_path.exists(), 'A release snapshot already exists; use a new output directory'
db = sqlite3.connect(target_path)
for migration in sorted((root/'migrations').glob('*.sql')): db.executescript(migration.read_text())
city_ids = {r['id']:'city:'+r['slug'] for r in snapshot.execute('SELECT id,slug FROM cities')}
private_ids = [r[0] for r in snapshot.execute('SELECT page_id FROM notion_links')]
fallback_id = 'source:legacy-private-reference'
private_source_ids = {r['id'] for r in snapshot.execute('SELECT id,url FROM sources')
  if 'notion.' in urlparse(r['url']).netloc or urlparse(r['url']).scheme not in ('http','https')}

def sanitize(value):
  if not isinstance(value, str): return value
  if value in city_ids: return city_ids[value]
  if value in private_source_ids: return fallback_id
  for old, new in city_ids.items():
    if old in value: value = value.replace(old,new)
  value = re.sub(r'https?://(?:[\w-]+\.)?notion\.(?:so|com)/[^\s"<>]+', origin+'/about/#method-scope', value)
  return value

tables = ['countries','sources','cities','city_months','metric_definitions','metric_observations',
  'ai_availability','visa_programs','workspace_quotes','editorial_pages','editorial_cities',
  'score_models','city_scores','city_entry_conditions','city_locations','city_climate_months',
  'cost_observations','fx_rates','geo_areas','city_geo_areas','regional_reference_observations']
editorial_slugs = {'first-month','chiang-mai-vs-penang','chiang-mai-vs-da-nang'}
editorial_ids = {r['id'] for r in snapshot.execute('SELECT id,slug FROM editorial_pages') if r['slug'] in editorial_slugs}
counts = {}
for table in tables:
  rows = []
  for raw in snapshot.execute('SELECT * FROM "'+table+'"'):
    r = dict(raw)
    if table == 'sources' and r['id'] in private_source_ids: continue
    if table == 'editorial_pages' and r['id'] not in editorial_ids: continue
    if table == 'editorial_cities' and r['page_id'] not in editorial_ids: continue
    r = {key:sanitize(value) for key,value in r.items()}
    if table == 'cities': r['publication_status'] = 'published'
    if table == 'editorial_pages': r['status'] = 'published'
    rows.append(r)
  if table == 'sources' and private_source_ids:
    rows.append(dict(id=fallback_id,url=origin+'/about/#method-scope',publisher='RemoteAI Nomads',
      title='原始参考记录；私人来源未随站点公开，当前数字未经独立核验',kind='legacy',license=None,accessed_at='2026-10-18'))
  for r in rows:
    columns = ','.join('"'+key+'"' for key in r)
    db.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({",".join("?" for _ in r)})',list(r.values()))
  counts[table] = len(rows)
assert not db.execute('PRAGMA foreign_key_check').fetchall(), 'Release foreign-key check failed'
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
db.commit()
statements = [line for line in db.iterdump() if line.startswith('INSERT INTO')]
sql = '\n'.join(line for table in tables for line in statements if line.startswith('INSERT INTO "'+table+'"'))+'\n'
assert not re.search(r'https?://[^\s]*notion\.(?:so|com)/',sql), 'A private source URL remains'
assert not any(pid in sql or pid.replace('-','') in sql for pid in private_ids), 'A Notion page identifier remains'
assert not re.search(r'\bsk-[A-Za-z0-9_-]{20,}',sql), 'A credential-shaped value remains'
assert counts['cities'] == len(city_ids) and counts['cities'] > 0
assert db.execute("SELECT count(*) FROM cities WHERE publication_status!='published'").fetchone()[0] == 0
for name in ['notion_links','content_documents','import_runs','visa_observations','cost_sync_runs','agent_admissions']:
  assert db.execute('SELECT count(*) FROM '+name).fetchone()[0] == 0
sql_path = out/'initial-publication.sql'; sql_path.write_text(sql); sql_path.chmod(0o600)
report = dict(origin=origin,rows=counts,private_notes_exported=0,notion_page_identifiers_exported=0,
  excluded_tables=['notion_links','content_documents','import_runs','visa_observations','cost_sync_runs','agent_admissions'],
  collapsed_private_sources=len(private_source_ids),sql_sha256=hashlib.sha256(sql.encode()).hexdigest(),bytes=len(sql.encode()))
(out/'publication.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
target_path.chmod(0o600); db.close(); snapshot.close()
print(json.dumps(report,ensure_ascii=False,indent=2))
