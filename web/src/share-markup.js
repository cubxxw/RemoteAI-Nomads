import {sitePath} from '../public/modules/site-path.js';
export function shareMarkup(data,base=''){
 const serialized=JSON.stringify(data).replace(/</g,'\\u003c');
 return {head:`<link rel="stylesheet" href="${sitePath('/share.css',base)}"><script type="application/json" id="share-page-data">${serialized}</script>`,toolbar:'<div class="share-page-toolbar"><button type="button" class="site-share" data-share-page disabled aria-busy="true" aria-label="正在准备分享" aria-haspopup="dialog"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 13V3m-4 4 4-4 4 4M4 11v6h12v-6"/></svg><span>分享</span></button></div>'};
}
