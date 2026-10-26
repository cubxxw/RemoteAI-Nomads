import {esc} from './render.js';
import {editorialScene, sceneImage} from './editorial-scenes.js';

// Deterministic article-cover registry (2026-10-23). Each cover is either the
// reviewed public photo of the article's own named city — with its original
// attribution, never another city's photo — or an editorial illustration for
// articles that name no city. Provenance was reviewed from the public catalog
// metadata; nothing here invents a location. See web/docs/design-refresh-2026-10-23.md.
const CITY_COVERS = Object.freeze(
{
  "baku": {
    "name_zh": "巴库",
    "photo_url": "/images/city-baku.webp",
    "photo_credit": "See above. Compilation by Interfase / CC BY-SA 3.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Baku_Montage.jpg"
  },
  "chengdu": {
    "name_zh": "成都",
    "photo_url": "/images/city-chengdu.webp",
    "photo_credit": "FISU / CC BY 3.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:%E9%9B%AA%E5%B1%B1%E4%B8%8B%E7%9A%84%E6%88%90%E9%83%BD%E5%B8%82%E5%A4%A9%E9%99%85%E7%BA%BF_Chengdu_skyline_with_snow_capped_mountains.jpg"
  },
  "chiang-mai": {
    "name_zh": "清迈",
    "photo_url": "/images/city-chiang-mai.webp",
    "photo_credit": "Nawit science / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:0020-%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B8%9E%E0%B8%A3%E0%B8%B0%E0%B8%AA%E0%B8%B4%E0%B8%87%E0%B8%AB%E0%B9%8C%E0%B8%A7%E0%B8%A3%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3.jpg"
  },
  "da-nang": {
    "name_zh": "岘港",
    "photo_url": "/images/city-da-nang.webp",
    "photo_credit": "Somerset999 / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Dragon_Bridge%2C_Da_Nang_during_day_-_20230819_%28cropped%29.jpg"
  },
  "dali": {
    "name_zh": "大理",
    "photo_url": "/images/city-dali.webp",
    "photo_credit": "Andrew and Annemarie / CC BY-SA 2.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Chongsheng_Temple_%2811050634113%29.jpg"
  },
  "fethiye": {
    "name_zh": "费特希耶",
    "photo_url": "/images/city-fethiye.webp",
    "photo_credit": "Alexander Annenkov from Moscow, Russia / CC BY 2.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Fethiye_Town_in_Daylight_%28cropped%29.jpg"
  },
  "hangzhou": {
    "name_zh": "杭州",
    "photo_url": "/images/city-hangzhou.webp",
    "photo_credit": "EditQ / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:%E6%9D%AD%E5%B7%9E%E9%92%B1%E6%B1%9F%E6%96%B0%E5%9F%8E_4_%28cropped%29.jpg"
  },
  "hanoi": {
    "name_zh": "河内",
    "photo_url": "/images/city-hanoi.webp",
    "photo_credit": "Quangnlnhe182394 / CC0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Hanoi_skyline_with_Ba_Vi_Mountain.jpg"
  },
  "kuala-lumpur": {
    "name_zh": "吉隆坡",
    "photo_url": "/images/city-kuala-lumpur.webp",
    "photo_credit": "Renek78 / CC0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Bukit_Bintang_junction_in_2024_2.jpg"
  },
  "lisbon": {
    "name_zh": "里斯本",
    "photo_url": "/images/city-lisbon.webp",
    "photo_credit": "Vita Marija Murenaite / Unsplash",
    "photo_source": "https://unsplash.com/photos/upwDG-yWTXQ"
  },
  "madrid": {
    "name_zh": "马德里",
    "photo_url": "/images/city-madrid.webp",
    "photo_credit": "Zarateman / CC0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Madrid_-_Sky_Bar_360%C2%BA_%28Hotel_Riu_Plaza_Espa%C3%B1a%29%2C_vistas_19.jpg"
  },
  "malaga": {
    "name_zh": "马拉加",
    "photo_url": "/images/city-malaga.webp",
    "photo_credit": "Kiban / CC BY-SA 3.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Da_Gibralfaro_%28cropped%292.jpg"
  },
  "penang": {
    "name_zh": "槟城",
    "photo_url": "/images/city-penang.webp",
    "photo_credit": "HundenvonPenang / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Skyline_of_George_Town%2C_Penang_at_night_Nov2024-29-17.jpg"
  },
  "plovdiv": {
    "name_zh": "普罗夫迪夫",
    "photo_url": "/images/city-plovdiv.webp",
    "photo_credit": "Община Пловдив / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:%D0%9F%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2.jpg"
  },
  "pokhara": {
    "name_zh": "博卡拉",
    "photo_url": "/images/city-pokhara.webp",
    "photo_credit": "Utsab Raj Giri / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:Pokhara_Valley.jpg"
  },
  "ubud": {
    "name_zh": "乌布（巴厘岛）",
    "photo_url": "/images/city-ubud.webp",
    "photo_credit": "Chainwit. / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File%3AUbud%20Palace%20%282022%29.jpg"
  },
  "xiamen": {
    "name_zh": "厦门",
    "photo_url": "/images/city-xiamen.webp",
    "photo_credit": "Windmemories / CC BY-SA 4.0",
    "photo_source": "https://commons.wikimedia.org/wiki/File:20121031_Xiamen_University_01.jpg"
  }
}
);

// Articles with no named city get a scene by their exact editorial subject,
// then a deterministic category scene, with descriptive illustration alt text.
const SCENE_BY_SLUG = Object.freeze({
  'nomad-budget-checklist': 'neighborhood-cafe',
  'video-meeting-room-checklist': 'work-by-the-lake',
  'two-pots-of-money': 'coastal-workday',
});
const SCENE_BY_CATEGORY = Object.freeze({start: 'coastal-workday', budget: 'neighborhood-cafe', season: 'coastal-workday', permission: 'work-by-the-lake', compare: 'work-by-the-lake'});

export function articleCover(entry) {
  const city = (entry.citySlugs || []).map(slug => CITY_COVERS[slug]).find(Boolean);
  if (city) return {kind: 'city', ...city};
  const sceneId = SCENE_BY_SLUG[entry.slug] || SCENE_BY_CATEGORY[entry.seriesCategory] || (entry.kind === 'comparison' ? 'coastal-workday' : 'neighborhood-cafe');
  return {kind: 'scene', id: sceneId, scene: editorialScene(sceneId)};
}

export function articleCoverHTML(entry) {
  const cover = articleCover(entry);
  if (cover.kind === 'city') return `<figure class="article-cover"><img src="${esc(cover.photo_url)}" alt="${esc(cover.name_zh)}城市实景" width="960" height="641" loading="lazy" decoding="async" data-photo-label="${esc(cover.name_zh)}"><figcaption class="article-cover-credit">${esc(cover.name_zh)} · <a href="${esc(cover.photo_source)}" target="_blank" rel="noopener noreferrer">${esc(cover.photo_credit)} ↗</a></figcaption></figure>`;
  return `<figure class="article-cover">${sceneImage(cover.id, {className: 'article-cover-image', sizes: '(max-width:700px) 92vw, 28vw'})}</figure>`;
}
