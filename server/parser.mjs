import {load} from 'cheerio';
import {canonicalProductUrl,validatePublicUrl} from './network.mjs';

export function textFromHtml(html=''){
 const $=load(String(html));$('script,style,nav,header,footer,noscript,svg').remove();
 return $.root().text().replace(/\s+/g,' ').trim().slice(0,80000);
}
export function nutritionRows(html=''){
 const $=load(String(html)),rows=[];
 $('table').each((_,table)=>{
  if(!/amount per serving|daily value|valeur quotidienne|n[äa]hrwert/i.test($(table).text()))return;
  $(table).find('tr').each((__,row)=>{
   const cells=$(row).children('td,th').map((___,cell)=>$(cell).text().replace(/\s+/g,' ').trim()).get();
   if(cells.length>=2&&cells[0]&&!/amount per serving|daily value|nutrient|percent|^\*|^†/i.test(cells[0]))rows.push({name:cells[0],amount:cells[1],evidence:cells.join(' | ')});
  });
 });
 return rows.slice(0,100);
}
export function safeImageUrl(value,base){
 if(!value)return null;
 try{const u=new URL(typeof value==='object'?value.url||value.contentUrl:value,base);validatePublicUrl(u.href);return u.href;}catch{return null;}
}
export function parseShopifyProduct(p,site){
 if(!p?.title||!p?.handle)return null;
 const variants=p.variants||[],price=Number(variants[0]?.price);
 return {source_product_id:String(p.id||p.handle),url:canonicalProductUrl(new URL('/products/'+encodeURIComponent(p.handle),site.url).href),name_original:p.title.slice(0,512),description_text:textFromHtml(p.body_html||''),price:Number.isFinite(price)&&variants[0]?.price!==undefined?price:null,currency:null,images:(p.images||[]).map(i=>({url:safeImageUrl(i.src,site.url),alt:i.alt||p.title})).filter(i=>i.url).slice(0,12),raw_data:{source:'shopify_catalog',product_type:p.product_type||null,tags:p.tags||[],variants:variants.slice(0,30),published_at:p.published_at||null,body_html:(p.body_html||'').slice(0,160000)}};
}
function flattenJsonLd(value){
 if(Array.isArray(value))return value.flatMap(flattenJsonLd);
 if(!value||typeof value!=='object')return [];
 return [value,...flattenJsonLd(value['@graph']),...flattenJsonLd(value.mainEntity)];
}
export function parseProductPage(html,url){
 const $=load(html);let nodes=[];
 $('script[type="application/ld+json"]').each((_,el)=>{try{nodes.push(...flattenJsonLd(JSON.parse($(el).text())));}catch{}});
 const product=nodes.find(n=>(Array.isArray(n['@type'])?n['@type']:[n['@type']]).some(t=>/^(Product|IndividualProduct)$/i.test(t||'')));
 if(!product?.name)return null;
 const offers=Array.isArray(product.offers)?product.offers[0]:product.offers;
 const singleOffer=offers?.offers?(Array.isArray(offers.offers)?offers.offers[0]:offers.offers):offers;
 const price=Number(singleOffer?.price??offers?.lowPrice);
 const candidates=Array.isArray(product.image)?product.image:[product.image];
 if(!candidates.filter(Boolean).length)candidates.push($('meta[property="og:image"]').attr('content'));
 const desc=typeof product.description==='string'?product.description:'';
 const primary=$('[itemprop="description"],.product__description,.product-description,[data-product-description],#product-description').first();
 const label=$('[id*="supplement-fact"],[class*="supplement-fact"],[id*="ingredient"],[class*="ingredient"]');
 const extra=label.map((_,e)=>$(e).text()).get().join(' ');
 const description_text=textFromHtml(desc+' '+(primary.html()||'')+' '+extra);
 return {url:canonicalProductUrl(url),name_original:textFromHtml(product.name).slice(0,512),description_text,price:Number.isFinite(price)&&(singleOffer?.price!==undefined||offers?.lowPrice!==undefined)?price:null,currency:singleOffer?.priceCurrency||offers?.priceCurrency||null,images:candidates.map(v=>({url:safeImageUrl(v,url),alt:product.name})).filter(i=>i.url).slice(0,12),source_language:($('html').attr('lang')||'').slice(0,30),raw_data:{source:'product_jsonld',jsonld:product,label_text:extra.slice(0,20000),description_html:(primary.html()||desc).slice(0,160000)}};
}
export function parseSitemap(xml){
 const $=load(xml,{xmlMode:true});
 return {sitemaps:$('sitemap > loc').map((_,e)=>$(e).text().trim()).get(),urls:$('url > loc').map((_,e)=>$(e).text().trim()).get()};
}
export function productLinks(html,base){
 const $=load(html);const urls=[];
 $('a[href]').each((_,e)=>{try{const u=new URL($(e).attr('href'),base);if(/\/products?\/|\/shop\/|\/p\//i.test(u.pathname))urls.push(canonicalProductUrl(u.href));}catch{}});
 return [...new Set(urls)];
}
