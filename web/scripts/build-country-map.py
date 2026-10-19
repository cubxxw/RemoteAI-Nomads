"""Retain Natural Earth identities, joined only by an exact catalog ISO code.

python3 scripts/build-country-map.py --geojson .data/ranking/world-map-units.geojson
The reviewed public country catalog supplies names and directory links. Small
regions absent from this scale stay in the selector, without invented outlines.
"""
import argparse
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_world(geojson, database):
    assert any(feature['properties'].get('GU_A3') == 'GUF' for feature in geojson['features']), 'Use Natural Earth map units, which distinguish overseas catalog regions'
    countries = {
        row['id']: dict(code=row['id'], name=row['name_zh'], nameEn=row['name_en'], region=row['region'], paths=[])
        for row in database.execute('SELECT id,name_zh,name_en,region FROM countries ORDER BY name_zh')
    }
    land = []
    for feature in geojson['features']:
        geometry, properties = feature['geometry'], feature['properties']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        pieces = []
        for polygon in polygons:
            for ring in polygon:
                if max(point[1] for point in ring) < -60:
                    continue
                points = [((lon + 180) / 360 * 1000, (85 - max(-60, min(85, lat))) / 145 * 480) for lon, lat, *_ in ring]
                pieces.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in points) + 'Z')
        if not pieces:
            continue
        code = next((properties.get(key) for key in ['ISO_A2', 'ISO_A2_EH'] if re.fullmatch('[A-Z]{2}', str(properties.get(key))) and properties[key] in countries), None)
        (countries[code]['paths'] if code else land).append(' '.join(pieces))
    return dict(width=1000, height=480, countries=list(countries.values()), land=land,
                source='Natural Earth 1:110m map units', license='Public domain',
                sourceUrl='https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_map_units.geojson')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--geojson', type=Path, required=True)
    parser.add_argument('--database', type=Path, default=ROOT / '.data/release/published.sqlite')
    args = parser.parse_args()
    database = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
    database.row_factory = sqlite3.Row
    world = build_world(json.loads(args.geojson.read_text()), database)
    (ROOT / 'public/map/world.json').write_text(json.dumps(world, ensure_ascii=False, separators=(',', ':')))
    print(f"Country map: {len(world['countries'])} directory entries; {sum(bool(c['paths']) for c in world['countries'])} outlines")
