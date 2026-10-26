import {articleBySlug} from './article-catalog.js';
import {comparisonFit} from './comparison-page.js';
import {comparisonArticle} from './comparison-article.js';

// Both the live database route and the outage route describe the same public
// comparison. The table is a WebPage, not a product review or a rating.
export function comparisonMetadata(a,b,{origin,month,indexable=false}) {
  const key=[a.slug,b.slug].sort().join('-vs-'),path='/compare/'+key+'/';
  const copy=articleBySlug(key),base=origin.replace(/\/$/,'');
  const article=comparisonArticle(key),image=article?base+'/comparison-assets/og-'+key+'.jpg':null;
  const title=copy?.title||a.name+' vs '+b.name+'：数字游民逐项对比';
  const description=copy?.summary||comparisonFit(a,b,month)+' '+comparisonFit(b,a,month);
  const url=base+path;
  return {title:article?.searchTitle||title,description,path,share:{kind:'comparison',cities:[a,b]},active:'compare',indexable,image,ogType:article?'article':'website',jsonld:{
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'WebPage','@id':url+'#webpage',url,name:title,description,inLanguage:'zh-CN',
        about:[a,b].map(city=>({'@type':'Place',name:city.name,url:base+'/cities/'+city.slug+'/'})),
        breadcrumb:{'@id':url+'#breadcrumb'},...(article?{mainEntity:{'@id':url+'#article'}}:{})},
      ...(article?[{'@type':'Article','@id':url+'#article',headline:article.title,description,dateModified:article.updatedAt,inLanguage:'zh-CN',image,mainEntityOfPage:{'@id':url+'#webpage'},author:{'@type':'Organization',name:'Roamorrow 编辑部',url:base+'/about/'},publisher:{'@type':'Organization',name:'Roamorrow',url:new URL(base).origin+'/'}}]:[]),
      {'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[
        {'@type':'ListItem',position:1,name:'Roamorrow 游民指南',item:base+'/'},
        {'@type':'ListItem',position:2,name:'城市对比',item:base+'/compare/'},
        {'@type':'ListItem',position:3,name:title,item:url},
      ]},
    ],
  }};
}
