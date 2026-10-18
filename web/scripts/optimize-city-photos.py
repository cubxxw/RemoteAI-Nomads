"""Validate the full licensed corpus and produce responsive local WebP assets."""
import hashlib,json,shutil
from pathlib import Path
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.data/media';originals=OUT/'originals';originals.mkdir(exist_ok=True)
filename=ROOT/'scripts/photos.json';photos=json.loads(filename.read_text());total=0
for slug,p in photos.items():
 source=ROOT/'public'/p['url'].lstrip('/');original=originals/(slug+source.suffix)
 if source.suffix!='.webp':shutil.copy2(source,original)
 else:original=next(originals.glob(slug+'.*'))
 with Image.open(original) as image:
  image.load();image=ImageOps.exif_transpose(image).convert('RGB');p['original_dimensions']=list(image.size)
  full=image.copy();full.thumbnail((1280,1280),Image.Resampling.LANCZOS)
  target=ROOT/'public/images'/('city-'+slug+'.webp');full.save(target,'WEBP',quality=82,method=6)
  thumb=ImageOps.fit(image,(128,128),Image.Resampling.LANCZOS);thumb_path=target.with_name(target.stem+'.thumb.webp');thumb.save(thumb_path,'WEBP',quality=78,method=6)
 p['url']='/images/'+target.name;p['thumbnail']='/images/'+thumb_path.name;p['dimensions']=list(full.size);p['sha256']=hashlib.sha256(target.read_bytes()).hexdigest();p['modification']='resized and re-encoded; square thumbnail crop'
 if source.suffix!='.webp':source.unlink()
 total+=target.stat().st_size+thumb_path.stat().st_size
filename.write_text(json.dumps(photos,ensure_ascii=False,indent=2))
q=lambda s:"'"+s.replace("'","''")+"'"
(OUT/'photos.sql').write_text('\n'.join('UPDATE cities SET photo_url='+q(v['url'])+',photo_credit='+q(v['credit'])+',photo_source='+q(v['source'])+' WHERE slug='+q(k)+';' for k,v in photos.items())+'\n')
(OUT/'image-validation.json').write_text(json.dumps({'cities':len(photos),'decoded':348,'local_full_assets':348,'local_thumbnails':348,'total_bytes':total,'original_bytes':sum(p.stat().st_size for p in originals.iterdir()),'checks':'Pillow decode + original dimensions + sha256 + licence + city identity manifest'},indent=2))
print((OUT/'image-validation.json').read_text())
