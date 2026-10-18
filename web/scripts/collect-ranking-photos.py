"""Batch Wikimedia photographs for the source ranking; retain attribution and licences.
Usage: python3 scripts/collect-ranking-photos.py /path/to/source-package [limit]
Stops on rate limits. Cached API responses and existing credits are retained.
"""
import html,json,re,sqlite3,sys,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/ranking';photos_path=ROOT/'scripts/photos.json';photos=json.loads(photos_path.read_text())
db=sqlite3.connect(ROOT/'.data/preview.sqlite');raw=json.loads((Path(sys.argv[1])/'notion-sync/cities-rows-before.json').read_text());score={r['id']:(r['properties']['Metric Score']['formula'].get('number') or 0) for r in raw}
rows=sorted([{'id':r[0],'slug':r[1],'name':r[2]} for r in db.execute('SELECT id,slug,name_en FROM cities')],key=lambda r:-score.get(r['id'][5:],0))[:int(sys.argv[2] if len(sys.argv)>2 else 40)]
alias={'okinawa-naha':'Naha','las-palmas':'Las Palmas','george-town':'George Town, Penang','penang':'George Town, Penang','merida':'Mérida, Yucatán','santa-cruz':'Santa Cruz de Tenerife','ahangama-weligama':'Weligama'}
headers={'User-Agent':'RemoteAI-Nomads-research/0.3 (local source-attributed preview)'}
def get(url):return urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30)
def query(host,params,cache):
 p=OUT/cache
 if p.exists():return json.loads(p.read_text())
 data=json.load(get('https://'+host+'/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json',**params})));assert 'query' in data;p.write_text(json.dumps(data));return data
pending=[r for r in rows if r['slug'] not in photos];errors=[]
try:
 titles={alias.get(r['slug'],r['name']):r for r in pending}
 pages=query('en.wikipedia.org',{'prop':'pageimages','titles':'|'.join(titles),'piprop':'thumbnail|name','pithumbsize':320,'redirects':1},'photo-batch-pages.json')['query']
 redirects={x['from']:x['to'] for x in pages.get('redirects',[])}
 normalized={x['from']:x['to'] for x in pages.get('normalized',[])}
 by_title={p['title']:p for p in pages['pages'].values()}
 candidates=[]
 for title,c in titles.items():
  title=normalized.get(title,title);p=by_title.get(redirects.get(title,title),{})
  if p.get('thumbnail') and p.get('pageimage'):candidates.append((c,p))
  else:errors.append({'slug':c['slug'],'error':'No licensed page image found'})
 files='|'.join('File:'+p['pageimage'] for c,p in candidates)
 metadata=query('commons.wikimedia.org',{'prop':'imageinfo','iiprop':'extmetadata','titles':files},'photo-batch-metadata.json')['query']['pages'] if files else {}
 by_file={p['title']:p.get('imageinfo',[{}])[0].get('extmetadata',{}) for p in metadata.values()}
 for c,p in candidates:
  try:
   filename=p['pageimage'];ext=by_file.get('File:'+filename.replace('_',' '),{})
   licence=ext.get('LicenseShortName',{}).get('value','');assert licence and ('CC' in licence or 'Public domain' in licence or licence=='PD'),'Licence unavailable'
   author=html.unescape(re.sub('<[^>]+>','',ext.get('Artist',{}).get('value','Wikimedia Commons'))).strip()[:180]
   image=p['thumbnail']['source'].split('?')[0].replace('thumb.wikimedia.org','upload.wikimedia.org');binary=get(image).read();assert len(binary)>1000
   out=ROOT/'public/images'/('city-'+c['slug']+'.jpg');out.write_bytes(binary)
   photos[c['slug']]={'url':'/images/'+out.name,'credit':author+' / '+licence,'source':'https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(filename),'license':licence,'license_url':ext.get('LicenseUrl',{}).get('value','https://commons.wikimedia.org/wiki/Commons:Licensing')}
   print(c['slug'],flush=True);time.sleep(.15)
  except Exception as e:
   errors.append({'slug':c['slug'],'error':str(e)[:120]})
   if getattr(e,'code',None)==429:break
except Exception as e:errors.append({'stage':'batch','error':str(e)[:160]})
photos_path.write_text(json.dumps(photos,ensure_ascii=False,indent=2));q=lambda s:"'"+s.replace("'","''")+"'"
sql=['UPDATE cities SET photo_url='+q(v['url'])+',photo_credit='+q(v['credit'])+',photo_source='+q(v['source'])+' WHERE slug='+q(k)+';' for k,v in photos.items()]
(OUT/'photos.sql').write_text('\n'.join(sql)+'\n');(OUT/'photo-report.json').write_text(json.dumps({'photos':len(photos),'errors':errors},ensure_ascii=False,indent=2));print(json.dumps({'photos':len(photos),'errors':errors},ensure_ascii=False),flush=True)
