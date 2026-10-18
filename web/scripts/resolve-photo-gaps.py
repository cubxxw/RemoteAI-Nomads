"""Resolve remaining city identities using Wikidata photos and Commons redirects."""
import hashlib,json,html,re,sys,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/media'
headers={'User-Agent':'RemoteAINomads/1.0 (https://github.com/cubxxw/RemoteAI-Nomads)'}
def request(url):
 cache=OUT/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 if cache.exists():return json.loads(cache.read_text())
 with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=35) as r:data=json.load(r)
 cache.write_text(json.dumps(data));time.sleep(.5);return data
def api(host,params):return request('https://'+host+'/w/api.php?'+urllib.parse.urlencode({'format':'json',**params}))
missing=json.loads((OUT/'unresolved.json').read_text())
alias={'dilijan':'Dilijan','lagos-algarve':'Lagos, Portugal','ramallah':'Ramallah','zanzibar':'Zanzibar City','san-jose':'San José, Costa Rica','new-york':'New York City','austin':'Austin, Texas','macao':'Macau','malacca':'Malacca City','singapore':'Singapore','davao':'Davao City','hong-kong':'Hong Kong','krakow':'Kraków','jeju':'Jeju City','ubud':'Ubud','hoi-an':'Hội An'}
titles={alias.get(c['slug'],c.get('wiki_title') or c['name_en']):c for c in missing}
q=api('en.wikipedia.org',{'action':'query','prop':'pageprops|pageimages','piprop':'name','titles':'|'.join(titles),'redirects':1})['query'];norm={x['from']:x['to'] for x in q.get('normalized',[])};redirects={x['from']:x['to'] for x in q.get('redirects',[])};pages={p['title']:p for p in q['pages'].values()}
resolved=[];fail=[]
for title,c in titles.items():
 title=norm.get(title,title);p=pages.get(redirects.get(title,title),{});qid=p.get('pageprops',{}).get('wikibase_item');resolved.append({**c,'title':p.get('title',title),'qid':qid,'wp_image':p.get('pageimage')})
qids='|'.join(c['qid'] for c in resolved if c.get('qid'))
entities=api('www.wikidata.org',{'action':'wbgetentities','ids':qids,'props':'claims'})['entities'] if qids else {}
candidates=[]
for c in resolved:
 claims=entities.get(c.get('qid'),{}).get('claims',{});photos=[p.get('mainsnak',{}).get('datavalue',{}).get('value') for p in claims.get('P18',[])];file=next((p for p in photos if isinstance(p,str) and not p.lower().endswith('.svg')),None) or c.get('wp_image')
 if not file:fail.append({'slug':c['slug'],'title':c['title'],'qid':c.get('qid'),'error':'No P18 photograph'});continue
 candidates.append({**c,'filename':file})
files='|'.join('File:'+c['filename'] for c in candidates)
q=api('commons.wikimedia.org',{'action':'query','prop':'imageinfo','iiprop':'extmetadata|url','iiurlwidth':640,'redirects':1,'titles':files})['query'];norm={x['from']:x['to'] for x in q.get('normalized',[])};red={x['from']:x['to'] for x in q.get('redirects',[])};pages={p['title']:p for p in q['pages'].values()}
manifest=[]
for c in candidates:
 title=norm.get('File:'+c['filename'],'File:'+c['filename'].replace('_',' '));p=pages.get(red.get(title,title),{});info=p.get('imageinfo',[{}])[0];ext=info.get('extmetadata',{});licence=ext.get('LicenseShortName',{}).get('value','')
 if not licence or not ('CC' in licence or 'Public domain' in licence or licence=='PD'):fail.append({'slug':c['slug'],'title':title,'error':'No Commons licence after redirect'});continue
 author=html.unescape(re.sub('<[^>]+>','',ext.get('Artist',{}).get('value','Wikimedia Commons'))).strip()[:500]
 manifest.append({**c,'thumbnail':info.get('thumburl') or info.get('url'),'credit':author+' / '+licence,'source':'https://commons.wikimedia.org/wiki/'+urllib.parse.quote(p['title']),'license':licence,'license_url':ext.get('LicenseUrl',{}).get('value','https://commons.wikimedia.org/wiki/Commons:Licensing'),'source_page':'https://en.wikipedia.org/wiki/'+urllib.parse.quote(c['title'].replace(' ','_')),'identity_match':'explicit_city_title+wikidata_P18','coordinate_distance_km':c.get('coordinate_distance_km')})
(OUT/'supplement.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(OUT/'supplement-unresolved.json').write_text(json.dumps(fail,ensure_ascii=False,indent=2));print(json.dumps({'resolved':len(manifest),'remaining':fail},ensure_ascii=False))
