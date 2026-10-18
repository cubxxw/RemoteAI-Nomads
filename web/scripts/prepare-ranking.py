"""Build the ranking projection from existing, allowlisted snapshots and GeoNames.
Geographical identity is matched inside the same country. Ambiguities stay unmapped.
"""
import collections,hashlib,json,re,sqlite3,sys,unicodedata,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/ranking';OUT.mkdir(parents=True,exist_ok=True)
INPUT=Path(sys.argv[1])
db=sqlite3.connect(ROOT/'.data/preview.sqlite');db.row_factory=sqlite3.Row
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def txt(p,k):
 v=p.get(k,{});return ''.join(x.get('plain_text',x.get('text',{}).get('content','')) for x in v.get(v.get('type'),[])) if v.get('type') in ('rich_text','title') else ''
quote=lambda v:'NULL' if v is None else str(v) if isinstance(v,(int,float)) else "'"+str(v).replace("'","''")+"'"
lines=[]
def put(table,**values):lines.append('INSERT OR REPLACE INTO '+table+' ('+','.join(values)+') VALUES ('+','.join(quote(v) for v in values.values())+');')
def source(url,title,kind='dataset',license=None):
 key=hashlib.sha256(url.encode()).hexdigest()[:20]
 put('sources',id=key,url=url,publisher=url.split('/')[2],title=title,kind=kind,license=license,accessed_at='2026-10-17');return key
weights={'safety':31.25,'cost':25,'climate':18.75,'life':18.75,'internet':6.25,'community':5}
put('score_models',id='legacy-metric-2026-10',label='Metric Score · 原始指标模型',default_weights=json.dumps(weights),formula_note='安全31.25%+成本25%+环境18.75%+生活18.75%+网络6.25%+社区很强0.5/有社区0.2；签证不计分。自定义分=加权均值×1.05，保留原范围。',max_score=10.5,snapshot_date='2026-10-17')
snapshot=json.loads((INPUT/'notion-sync/cities-rows-before.json').read_text());by_page={x['id']:x for x in snapshot}
rows=[dict(x) for x in db.execute('SELECT c.*,k.iso2 FROM cities c JOIN countries k ON k.id=c.country_id')]
scores=[]
for c in rows:
 page_id=c['id'][5:];p=by_page[page_id]['properties'];url='https://www.notion.so/'+page_id.replace('-','')
 sid=source(url,'原城市记录的指标快照；尚未逐项复核','legacy')
 metrics={k:p.get(v,{}).get('number') for k,v in {'safety':'Safety','cost':'Cost Score','climate':'Environment','life':'Living','internet':'Internet'}.items()}
 vibe=(p.get('Nomad Vibe',{}).get('select') or {}).get('name');metrics['community']={'社区很强':10,'有社区':4,'小众安静':0}.get(vibe)
 base=p['Metric Score']['formula'].get('number');raw=txt(p,'Why Good')
 # Keep a short original reason; drop synthesized metric summaries when a curated summary is better.
 why=re.split('；|。|！',raw)[0].strip()
 if not why or 'Numbeo' in why or '全球' in why or len(why)>58:
  types=[x['name'] for x in p.get('City Type',{}).get('multi_select',[])]
  highlights=[label for key,label in [('safety','安全指标较高'),('cost','成本指标较高'),('internet','网络指标较高')] if (metrics[key] or 0)>=9]
  why=' · '.join((types+highlights+([vibe] if vibe else []))[:3]) or c['name_zh']+' · 城市条件待补充'
 why=why.replace('所有 AI 工具无需 VPN','具体 AI 服务需核对官方地域条件')
 put('city_scores',city_id=c['id'],model_id='legacy-metric-2026-10',**metrics,original_metric_score=base,community_label=vibe,why_short=why,evidence_level='legacy',checked_at=c['checked_at'] or '2026-10-17',source_id=sid)
 label=(p.get('签证可达性(大陆护照)',{}).get('select') or {}).get('name','待核验')
 code={'免签':'visa_free','电子签':'evisa','落地签':'arrival','需签证':'visa_required','通行证/签注':'permit','目前不可达':'unavailable'}.get(label,'unknown')
 if c['country_id']=='CN':code='domestic';label='境内'
 put('city_entry_conditions',city_id=c['id'],passport='CN',entry_type=code,label=label,detail='原记录标签，尚未逐项复核；停留条件与合法远程工作需分别确认。',evidence_level='legacy',checked_at=c['checked_at'] or '2026-10-17',source_id=sid)
 scores.append({'slug':c['slug'],'complete':all(v is not None for v in metrics.values()),'score':base})

archive=next(p for p in [OUT/'cities1000.zip',OUT/'cities15000.zip'] if p.exists() and zipfile.is_zipfile(p))
geo_source=source('https://download.geonames.org/export/dump/'+archive.name,'GeoNames '+archive.stem+'；2026-10-17下载','dataset','CC BY')
index=collections.defaultdict(list)
with zipfile.ZipFile(archive) as z:
 with z.open(archive.stem+'.txt') as f:
  for line in f:
   x=line.decode().rstrip('\n').split('\t')
   if len(x)<19:continue
   rec={'id':int(x[0]),'name':x[1],'country':x[8],'lat':float(x[4]),'lon':float(x[5]),'population':int(x[14] or 0),'timezone':x[17]}
   for name in set([x[1],x[2],*x[3].split(',')]):
    key=norm(name)
    if key:index[(x[8],key)].append(rec)
aliases={'cangguubud':'Canggu','hoian':'Hoi An','danang':'Da Nang','funchalmadeira':'Funchal','madeira':'Funchal','bali':'Denpasar','laspalmas':'Las Palmas de Gran Canaria','newyorkcity':'New York City','mexicocity':'Ciudad de México','saigon':'Ho Chi Minh City'}
mapped=[];missing=[]
for c in rows:
 country=c['iso2'];name=re.sub(r'\([^)]*\)|（[^）]*）','',c['name_en']).strip()
 key=norm(name);base=aliases.get(key,name)
 matches={r['id']:r for r in index.get((country,norm(base)),[])}
 if not matches and norm(c['name_zh']):matches={r['id']:r for r in index.get((country,norm(c['name_zh'])),[])}
 candidates=sorted(matches.values(),key=lambda r:-r['population'])
 if not candidates or (len(candidates)>1 and candidates[0]['population']<candidates[1]['population']*2):
  missing.append({'slug':c['slug'],'name':c['name_en'],'country':country,'reason':'not_unique' if candidates else 'not_found'});continue
 r=candidates[0];method='country+exact_name' if norm(base)==key else 'country+explicit_alias'
 # Do not map a whole island to a guessed city centroid.
 if key=='bali':missing.append({'slug':c['slug'],'name':name,'country':country,'reason':'island_not_city'});continue
 put('city_locations',city_id=c['id'],latitude=r['lat'],longitude=r['lon'],timezone=r['timezone'],geonames_id=r['id'],match_method=method,source_id=geo_source,checked_at='2026-10-17')
 mapped.append({'city_id':c['id'],'slug':c['slug'],'name':name,'country':country,**r})
# Reuse the reviewed same-country geocoding supplement without refetching it.
extra_path=OUT/'locations-extra.json'
if extra_path.exists():
 for r in json.loads(extra_path.read_text()):
  c=next((c for c in rows if c['id']==r['city_id'] and c['iso2']==r['country']),None)
  if not c or r['slug'] in {x['slug'] for x in mapped}:continue
  sid=source('https://geocoding-api.open-meteo.com/v1/search?'+__import__('urllib.parse',fromlist=['urlencode']).urlencode({'name':r['name'],'count':5,'language':'en','format':'json'}),'Open-Meteo Geocoding / GeoNames · 同国家唯一匹配','dataset','CC BY')
  put('city_locations',city_id=r['city_id'],latitude=r['lat'],longitude=r['lon'],timezone=r['timezone'],geonames_id=r['id'],match_method='country+geocoding_unique',source_id=sid,checked_at='2026-10-17')
  mapped.append(r);missing=[m for m in missing if m['slug']!=r['slug']]
(OUT/'ranking.sql').write_text('\n'.join(lines)+'\n')
(OUT/'locations.json').write_text(json.dumps(mapped,ensure_ascii=False,indent=2))
(OUT/'unmapped.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2))
report={'cities':len(rows),'complete_scores':sum(x['complete'] for x in scores),'mapped':len(mapped),'unmapped':missing}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))

# Render a local, dependency-free world map in an equirectangular projection.
world=json.loads((OUT/'world.geojson').read_text());paths=[]
for feature in world['features']:
 geom=feature['geometry'];polygons=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
 pieces=[]
 for polygon in polygons:
  for ring in polygon:
   if max(p[1] for p in ring)<-60:continue
   pts=[((lon+180)/360*1000,(85-max(-60,min(85,lat)))/145*480) for lon,lat,*_ in ring]
   pieces.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in pts)+'Z')
 if pieces:paths.append(' '.join(pieces))
(ROOT/'public/map/world.json').write_text(json.dumps({'width':1000,'height':480,'paths':paths,'source':'Natural Earth 1:110m','license':'Public domain'},separators=(',',':')))
