"""Finish reviewed Commons gaps, persist local photos and verify every city asset.
Run after complete-city-photos.py; --wait waits for that collector's report.
No guessed photographs, remote dependencies at render time or placeholder credits.
"""
import hashlib,json,sys,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/media'
if '--wait' in sys.argv:
 deadline=time.monotonic()+1800
 while not (OUT/'download-report.json').exists():
  if time.monotonic()>deadline:raise TimeoutError('Primary collector still running')
  time.sleep(10)
photos_file=ROOT/'scripts/photos.json';photos=json.loads(photos_file.read_text())
headers={'User-Agent':'RemoteAINomads/1.0 (https://github.com/cubxxw/RemoteAI-Nomads; source-attributed city directory)'}
def download(url):
 for attempt in range(4):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=40) as response:binary=response.read()
   assert len(binary)>1000 and (binary[:2]==b'\xff\xd8' or binary[:8]==b'\x89PNG\r\n\x1a\n' or binary[:4]==b'RIFF'),'Invalid photo response'
   return binary
  except urllib.error.HTTPError as e:
   if e.code not in (429,502,503) or attempt==3:raise
   time.sleep(20*(attempt+1))
def save():photos_file.write_text(json.dumps(photos,ensure_ascii=False,indent=2))
manifest=json.loads((OUT/'manifest.json').read_text())+json.loads((OUT/'supplement.json').read_text())
for c in manifest:
 if c['slug'] in photos:continue
 binary=download(c['thumbnail']);target=ROOT/'public/images'/('city-'+c['slug']+'.jpg');target.write_bytes(binary)
 photos[c['slug']]={k:c.get(k) for k in ['credit','source','license','license_url','source_page','identity_match','coordinate_distance_km']};photos[c['slug']]['url']='/images/'+target.name;save()
 print(json.dumps({'city':c['slug'],'photos':len(photos)},ensure_ascii=False),flush=True);time.sleep(.7)
for slug,p in photos.items():
 if p['url'].startswith('https://'):
  target=ROOT/'public/images'/('city-'+slug+'.jpg');target.write_bytes(download(p['url']));p['url']='/images/'+target.name
 if 'Unsplash' in p['credit']:
  p.update(license='Unsplash License',license_url='https://unsplash.com/license',source_page=p['source'],identity_match='original_editorial_city_photo')
 else:
  p.setdefault('license',p['credit'].split(' / ')[-1]);p.setdefault('license_url','https://creativecommons.org/licenses/by-sa/4.0/' if 'BY-SA 4.0' in p['license'] else p['source']);p.setdefault('source_page',p['source']);p.setdefault('identity_match','original_editorial_city_photo')
 p['sha256']=hashlib.sha256((ROOT/'public'/p['url'].lstrip('/')).read_bytes()).hexdigest()
save()
q=lambda s:"'"+s.replace("'","''")+"'"
(OUT/'photos.sql').write_text('\n'.join('UPDATE cities SET photo_url='+q(v['url'])+',photo_credit='+q(v['credit'])+',photo_source='+q(v['source'])+' WHERE slug='+q(k)+';' for k,v in photos.items())+'\n')
assert len(photos)==348,len(photos)
assert all(p['url'].startswith('/images/') and p['license'] and p['source_page'] and p['credit'] and (ROOT/'public'/p['url'].lstrip('/')).is_file() for p in photos.values())
(OUT/'final-report.json').write_text(json.dumps({'photos':len(photos),'local':348,'licensed':348,'bytes':sum((ROOT/'public'/p['url'].lstrip('/')).stat().st_size for p in photos.values())},indent=2))
print((OUT/'final-report.json').read_text(),flush=True)
