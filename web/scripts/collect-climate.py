"""Fetch/cache ERA5 daily reanalysis and aggregate 2023–2025 calendar months.
Raw weather stays local. Climate values are estimates at a grid cell, not room tests.
"""
import collections,concurrent.futures,datetime,hashlib,json,statistics,sys,time,threading,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/ranking';CACHE=OUT/'climate';CACHE.mkdir(exist_ok=True)
places=json.loads((OUT/'locations.json').read_text());cached_only='--cached-only' in sys.argv;selected=set(a for a in sys.argv[1:] if not a.startswith('--'));
if cached_only:places=[p for p in places if (CACHE/(p['slug']+'.json')).exists()]
if selected:
 places=[p for p in places if p['slug'] in selected]
 order={slug:i for i,slug in enumerate(sys.argv[1:])};places.sort(key=lambda p:order.get(p['slug'],999))
limited=threading.Event()
def quote(v):return 'NULL' if v is None else str(v) if isinstance(v,(int,float)) else "'"+v.replace("'","''")+"'"
def fetch(p):
 target=CACHE/(p['slug']+'.json')
 query=urllib.parse.urlencode({'latitude':p['lat'],'longitude':p['lon'],'start_date':'2023-01-01','end_date':'2025-12-31','daily':'temperature_2m_mean,temperature_2m_max,precipitation_sum','models':'era5','timezone':'UTC'})
 url='https://archive-api.open-meteo.com/v1/archive?'+query
 try:
  if target.exists():data=json.loads(target.read_text())
  else:
   if limited.is_set():return {'slug':p['slug'],'error':'rate_limited_pending'}
   req=urllib.request.Request(url,headers={'User-Agent':'RemoteAI-Nomads-research/0.2'})
   with urllib.request.urlopen(req,timeout=25) as response:data=json.load(response)
   assert len(data['daily']['time'])>=1095
   target.write_text(json.dumps(data,separators=(',',':')));time.sleep(.4)
  daily=data['daily'];months=collections.defaultdict(list)
  for d,mean,high,rain in zip(daily['time'],daily['temperature_2m_mean'],daily['temperature_2m_max'],daily['precipitation_sum']):
   if all(v is not None for v in [mean,high,rain]):months[int(d[5:7])].append((mean,high,rain))
  values=[{'month':m,'mean_c':round(statistics.mean(x[0] for x in vals),2),'high_c':round(statistics.mean(x[1] for x in vals),2),'rain_mm':round(sum(x[2] for x in vals)/3,2),'sample_days':len(vals)} for m,vals in sorted(months.items())]
  return {'slug':p['slug'],'city_id':p['city_id'],'url':url,'months':values}
 except Exception as e:
  if getattr(e,'code',None)==429:limited.set()
  return {'slug':p['slug'],'error':str(e)[:180]}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 for i,r in enumerate(pool.map(fetch,places),1):
  results.append(r)
  if i%25==0:print(json.dumps({'processed':i,'total':len(places),'success':sum('error' not in x for x in results)}),flush=True)
# Include all previously fetched cities when rebuilding the SQL after a partial retry.
all_places={p['slug']:p for p in json.loads((OUT/'locations.json').read_text())}
if selected:
 known={r['slug'] for r in results}
 for f in CACHE.glob('*.json'):
  if f.stem in all_places and f.stem not in known:results.append(fetch(all_places[f.stem]))
sql=[]
for r in results:
 if 'error' in r:continue
 sid=hashlib.sha256(r['url'].encode()).hexdigest()[:20]
 sql.append("INSERT OR IGNORE INTO sources (id,url,publisher,title,kind,license,accessed_at) VALUES ("+','.join(quote(v) for v in [sid,r['url'],'Open-Meteo / ECMWF ERA5','2023–2025 ERA5城市历史气象月聚合','official','CC BY 4.0','2026-10-17'])+");")
 for m in r['months']:
  vals=[r['city_id'],m['month'],m['mean_c'],m['high_c'],m['rain_mm'],m['sample_days'],'2023-01-01','2025-12-31','ERA5',sid,'2026-10-17']
  sql.append('INSERT OR REPLACE INTO city_climate_months (city_id,month,mean_c,high_c,rain_mm,sample_days,period_start,period_end,model,source_id,checked_at) VALUES ('+','.join(quote(v) for v in vals)+');')
(OUT/'climate.sql').write_text('\n'.join(sql)+'\n');(OUT/'climate-report.json').write_text(json.dumps({'cities':len(results),'successful':sum('error' not in r for r in results),'failed':[r for r in results if 'error' in r]},ensure_ascii=False,indent=2))
print(json.dumps({'cities':len(results),'successful':sum('error' not in r for r in results),'months':sum(len(r.get('months',[])) for r in results)},ensure_ascii=False),flush=True)
