"""Fetch ONE explicitly selected Notion text page into a draft SQL file.
Never queries databases, patches Notion, follows child pages, or publishes.
Usage: python3 scripts/import-notion-text.py PAGE_ID
Then review .data/document-*.sql before applying to local D1.
"""
import datetime,hashlib,json,re,subprocess,sys
from pathlib import Path
page_id=sys.argv[1]
if not re.fullmatch(r'[0-9a-fA-F-]{32,36}',page_id):raise SystemExit('Expected a Notion page UUID')
r=subprocess.run(['ntn','pages','get',page_id,'--notion-version','2025-09-03','--json'],capture_output=True,text=True,timeout=90,check=True)
result=json.loads(r.stdout)
md=result['markdown']
if md.get('truncated') or md.get('unknown_block_ids'):raise SystemExit('Incomplete page export; not imported')
body=md['markdown'];page=result['page']
if len(body.encode('utf-8'))>1_800_000:raise SystemExit('Text exceeds the safe D1 row budget; split the document before import')
if page.get('parent',{}).get('type') in ('data_source_id','database_id'):raise SystemExit('This importer accepts ordinary text pages, not database rows')
title='Untitled'
for prop in page.get('properties',{}).values():
 if prop.get('type')=='title':title=''.join(x.get('plain_text',x.get('text',{}).get('content','')) for x in prop['title'])
sha=hashlib.sha256(body.encode()).hexdigest();key='doc:'+page_id+':'+sha[:16]
quote=lambda s:"'"+s.replace("'","''")+"'"
values=[key,page_id,sha,title,body,datetime.datetime.now(datetime.timezone.utc).isoformat(),'draft']
sql='INSERT OR IGNORE INTO content_documents (id,source_page_id,revision_hash,title,body_markdown,imported_at,status) VALUES ('+','.join(map(quote,values))+');\n'
p=Path(__file__).resolve().parents[1]/'.data';p.mkdir(exist_ok=True);out=p/('document-'+sha[:16]+'.sql');out.write_text(sql)
print(json.dumps({'file':str(out),'page_id':page_id,'title':title,'characters':len(body),'status':'draft','notion_write':False},ensure_ascii=False))
