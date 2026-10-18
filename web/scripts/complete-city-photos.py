"""Source actual city photographs, country/coordinate-match identity, retain licences.
Caches metadata and image responses; refuses unlicensed/local-only Wikipedia images.
Run without --download to inspect the source manifest first.
"""
import concurrent.futures,hashlib,html,json,math,re,sqlite3,sys,time,urllib.error,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/media';OUT.mkdir(parents=True,exist_ok=True)
photos_path=ROOT/'scripts/photos.json';photos=json.loads(photos_path.read_text())
base=sqlite3.connect(ROOT/'.data/preview.sqlite');base.row_factory=sqlite3.Row
cities=[dict(r) for r in base.execute('SELECT c.id,c.slug,c.name_en,c.name_zh,k.name_en country,k.iso2 FROM cities c JOIN countries k ON k.id=c.country_id')]
dbfile=next(p for p in (ROOT/'.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite')
live=sqlite3.connect('file:'+str(dbfile)+'?mode=ro&immutable=1',uri=True)
locations={r[0]:(r[1],r[2]) for r in live.execute('SELECT city_id,latitude,longitude FROM city_locations')}
alias={'okinawa-naha':'Naha','penang':'George Town, Penang','george-town':'George Town, Penang','las-palmas':'Las Palmas','merida':'Mérida, Yucatán','santa-cruz':'Santa Cruz de Tenerife','ahangama-weligama':'Weligama','ella':'Ella, Sri Lanka','hoi-an':'Hội An','cuenca':'Cuenca, Ecuador','kuta-lombok':'Kuta, Lombok','koh-phangan':'Ko Pha-ngan','ponta-do-sol':'Ponta do Sol','goa':'Goa','siargao':'Siargao','lanzarote':'Lanzarote','anji':'Anji County','canggu':'Canggu'}
headers={'User-Agent':'RemoteAINomads/1.0 (https://github.com/cubxxw/RemoteAI-Nomads; source-attributed city directory)'}
def request(url,tries=3):
 for attempt in range(tries):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=35) as r:return r.read()
  except urllib.error.HTTPError as e:
   if e.code not in (429,502,503) or attempt==tries-1:raise
   delay=min(90,max(20*(attempt+1),int(e.headers.get('Retry-After','0')) if e.headers.get('Retry-After','').isdigit() else 0));print(json.dumps({'rate_limit':e.code,'wait_seconds':delay}),flush=True);time.sleep(delay)
  except Exception:
   if attempt==tries-1:raise
   time.sleep(2)
def query(host,params):
 url='https://'+host+'/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json',**params});path=OUT/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 if path.exists():return json.loads(path.read_text())
 data=json.loads(request(url));assert 'query' in data,(data.get('error') or 'No query result');path.write_text(json.dumps(data));time.sleep(.3);return data
def distance(a,b):
 a,b=map(lambda c:list(map(math.radians,c)),[a,b]);return 6371*2*math.asin(min(1,math.sqrt(math.sin((b[0]-a[0])/2)**2+math.cos(a[0])*math.cos(b[0])*math.sin((b[1]-a[1])/2)**2)))
def resolve(items):
 q=query('en.wikipedia.org',{'prop':'pageimages|coordinates','titles':'|'.join(t for c,t in items),'piprop':'thumbnail|name','pithumbsize':640,'redirects':1,'colimit':'max'})['query']
 normalization={x['from']:x['to'] for x in q.get('normalized',[])};redirects={x['from']:x['to'] for x in q.get('redirects',[])};pages={p['title']:p for p in q['pages'].values()};found=[];missing=[]
 for c,title in items:
  title=normalization.get(title,title);title=redirects.get(title,title);p=pages.get(title,{})
  coord=next(iter(p.get('coordinates',[])),None);expected=locations.get(c['id']);separation=distance(expected,(coord['lat'],coord['lon'])) if expected and coord else None
  valid=bool(p.get('thumbnail') and p.get('pageimage') and not re.search(r'\.svg$',p['pageimage'],re.I) and ((separation is not None and separation<100) or c['slug'] in alias))
  if valid:found.append({**c,'wiki_title':title,'filename':p['pageimage'],'thumbnail':p['thumbnail']['source'].split('?')[0].replace('thumb.wikimedia.org','upload.wikimedia.org'),'coordinate_distance_km':round(separation,2) if separation is not None else None,'identity_match':'same_city_coordinates' if separation is not None and separation<100 else 'explicit_place_title'})
  else:missing.append({**c,'attempt_title':title,'distance_km':separation})
 return found,missing
manifest=[];missing=[]
pending=[c for c in cities if c['slug'] not in photos]
for i in range(0,len(pending),35):
 batch=pending[i:i+35];found,failed=resolve([(c,alias.get(c['slug'],c['name_en'])) for c in batch]);manifest+=found;missing+=failed;print(json.dumps({'metadata':min(i+35,len(pending)),'total':len(pending),'matched':len(manifest)}),flush=True)
# Disambiguate only unmatched names; a coordinate match is still required.
retry=[]
for c in missing:
 title=c['name_en']+', '+c['country'];retry.append((c,title))
missing=[]
for i in range(0,len(retry),35):
 found,failed=resolve(retry[i:i+35]);manifest+=found;missing+=failed
licensed=[]
for i in range(0,len(manifest),30):
 batch=manifest[i:i+30];q=query('commons.wikimedia.org',{'prop':'imageinfo','iiprop':'extmetadata','titles':'|'.join('File:'+c['filename'] for c in batch)})['query'];norm={x['from']:x['to'] for x in q.get('normalized',[])};by_file={p['title']:p for p in q['pages'].values()}
 for c in batch:
  title=norm.get('File:'+c['filename'],'File:'+c['filename'].replace('_',' '));ext=by_file.get(title,{}).get('imageinfo',[{}])[0].get('extmetadata',{});licence=ext.get('LicenseShortName',{}).get('value','')
  if not licence or not ('CC' in licence or 'Public domain' in licence or licence=='PD'):missing.append({**c,'error':'No free Commons licence'});continue
  author=html.unescape(re.sub('<[^>]+>','',ext.get('Artist',{}).get('value','Wikimedia Commons'))).strip()[:500]
  licensed.append({**c,'credit':author+' / '+licence,'license':licence,'license_url':ext.get('LicenseUrl',{}).get('value','https://commons.wikimedia.org/wiki/Commons:Licensing'),'source':'https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(c['filename']),'source_page':'https://en.wikipedia.org/wiki/'+urllib.parse.quote(c['wiki_title'].replace(' ','_'))})
(OUT/'manifest.json').write_text(json.dumps(licensed,ensure_ascii=False,indent=2));(OUT/'unresolved.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2));print(json.dumps({'licensed':len(licensed),'unresolved':len(missing)}),flush=True)
if '--download' not in sys.argv:sys.exit(0)
def save():photos_path.write_text(json.dumps(photos,ensure_ascii=False,indent=2))
errors=[]
for i,c in enumerate(licensed,1):
 if c['slug'] in photos:continue
 try:
  target=ROOT/'public/images'/('city-'+c['slug']+'.jpg');binary=request(c['thumbnail']);assert len(binary)>1000 and (binary[:2]==b'\xff\xd8' or binary[:8]==b'\x89PNG\r\n\x1a\n' or binary[:4]==b'RIFF'),'Unsupported image response';target.write_bytes(binary)
  photos[c['slug']]={k:c[k] for k in ['credit','source','license','license_url','source_page','identity_match','coordinate_distance_km']};photos[c['slug']]['url']='/images/'+target.name;save()
  if i%5==0:print(json.dumps({'downloaded':len(photos),'total':len(cities)}),flush=True)
  time.sleep(.7)
 except Exception as e:errors.append({'slug':c['slug'],'error':str(e)[:180]});print(json.dumps(errors[-1]),flush=True)
q=lambda s:"'"+s.replace("'","''")+"'";(OUT/'photos.sql').write_text('\n'.join('UPDATE cities SET photo_url='+q(v['url'])+',photo_credit='+q(v['credit'])+',photo_source='+q(v['source'])+' WHERE slug='+q(k)+';' for k,v in photos.items())+'\n');(OUT/'download-report.json').write_text(json.dumps({'photos':len(photos),'errors':errors,'unresolved':len(missing)},ensure_ascii=False,indent=2));print(json.dumps({'photos':len(photos),'errors':len(errors),'unresolved':len(missing)}),flush=True)
