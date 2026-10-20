import {articleBySlug} from './article-catalog.js';
import {comparisonFit} from './comparison-page.js';

// Both the live database route and the outage route describe the same public
// comparison. The table is a WebPage, not a product review or a rating.
export function comparisonMetadata(a,b,{origin,month,indexable=false}) {
  const key=[a.slug,b.slug].sort().join('-vs-'),path='/compare/'+key+'/';
  const copy=articleBySlug(key),base=origin.replace(/\/$/,'');
  const title=copy?.title||a.name+' vs '+b.name+'：数字游民逐项对比';
  const description=copy?.summary||comparisonFit(a,b,month)+' '+comparisonFit(b,a,month);
  const url=base+path;
  return {title,description,path,active:'compare',indexable,jsonld:{
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'WebPage','@id':url+'#webpage',url,name:title,description,inLanguage:'zh-CN',
        about:[a,b].map(city=>({'@type':'Place',name:city.name,url:base+'/cities/'+city.slug+'/'})),
        breadcrumb:{'@id':url+'#breadcrumb'}},
      {'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[
        {'@type':'ListItem',position:1,name:'Roamorrow 游民指南',item:base+'/'},
        {'@type':'ListItem',position:2,name:'城市对比',item:base+'/compare/'},
        {'@type':'ListItem',position:3,name:title,item:url},
      ]},
    ],
  }};
}
