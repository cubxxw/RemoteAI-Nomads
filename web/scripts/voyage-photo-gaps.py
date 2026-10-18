import json,html,re,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/media';headers={'User-Agent':'RemoteAINomads/1.0 (source-attributed city directory)'}
data=json.loads((OUT/'voyage-gaps.json').read_text());pages=list(data['query']['pages'].values());titles='|'.join('File:'+p['pageimage'] for p in pages)
url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'extmetadata|url','iiurlwidth':640,'redirects':1,'titles':titles})
with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as r:q=json.load(r)['query']
(OUT/'voyage-commons.json').write_text(json.dumps(q));norm={x['from']:x['to'] for x in q.get('normalized',[])};red={x['from']:x['to'] for x in q.get('redirects',[])};files={p['title']:p for p in q['pages'].values()};by_slug={p['name_en']:p for p in json.loads((OUT/'unresolved.json').read_text())};manifest=json.loads((OUT/'supplement.json').read_text());resolved=[]
for page in pages:
 file='File:'+page['pageimage'];title=norm.get(file,file.replace('_',' '));p=files.get(red.get(title,title),{});info=p.get('imageinfo',[{}])[0];ext=info.get('extmetadata',{});licence=ext.get('LicenseShortName',{}).get('value','')
 if not licence or not ('CC' in licence or 'Public domain' in licence or licence=='PD'):print({'title':title,'licence':licence});continue
 c=by_slug[page['title']];author=html.unescape(re.sub('<[^>]+>','',ext.get('Artist',{}).get('value','Wikimedia Commons'))).strip()[:500]
 manifest.append({**c,'filename':page['pageimage'],'thumbnail':info.get('thumburl') or info.get('url'),'credit':author+' / '+licence,'source':'https://commons.wikimedia.org/wiki/'+urllib.parse.quote(p['title']),'license':licence,'license_url':ext.get('LicenseUrl',{}).get('value','https://commons.wikimedia.org/wiki/Commons:Licensing'),'source_page':'https://en.wikivoyage.org/wiki/'+urllib.parse.quote(page['title'].replace(' ','_')),'identity_match':'explicit_city_wikivoyage+wikidata_identity','coordinate_distance_km':c.get('coordinate_distance_km')});resolved.append(c['slug'])
(OUT/'supplement.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(json.dumps({'added':resolved,'total_supplement':len(manifest)}))
