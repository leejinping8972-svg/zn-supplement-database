import {setTimeout as delay} from 'node:timers/promises';
import {requestPublic,robotRules,USER_AGENT,validatePublicUrl,canonicalProductUrl} from './network.mjs';
import {parseShopifyProduct,parseProductPage,parseSitemap,productLinks} from './parser.mjs';

export function isMerchandise(product){return /\b(t-shirt|hoodie|sweatshirt|shaker bottle|gift card|baseball cap|tank top|water bottle)\b/i.test(product.name_original+' '+(product.raw_data?.product_type||''));}
const isStopError=e=>['APPROVAL_REQUIRED','SITE_NOT_APPROVED','JOB_CANCELLED'].includes(e.code);
export async function crawlSite(site,{limit=10,request=requestPublic,rulesProvider=robotRules,check=async()=>{},onProduct=async()=>{},onLog=async()=>{},wait=delay}={}){
 await check();
 const rules=await rulesProvider(site,request);let requests=0,found=0,skipped=0;
 const crawlDelay=rules.getCrawlDelay(USER_AGENT)||0;
 if(crawlDelay>60)throw new Error('站点要求较长采集间隔，需另行安排采集');
 const interval=Math.max(1000,crawlDelay*1000);
 const get=async(url)=>{
  await check();validatePublicUrl(url,site.domain);
  if(rules.isAllowed(url,USER_AGENT)===false){await onLog('robots.txt禁止访问：'+url);return null;}
  if(requests>=Math.min(1500,Math.max(120,limit*2+30)))throw new Error('达到单站请求上限');
  if(requests)await wait(interval);await check();requests++;
  return request(url,{allowedDomain:site.domain});
 };
 const seen=new Set();
 const ingest=async product=>{
  if(!product||seen.has(product.url)||found>=limit)return;
  seen.add(product.url);
  if(isMerchandise(product)){skipped++;return;}
  await check();await onProduct(product);found++;
 };
 let shopify=false;
 for(let page=1;page<=20&&found<limit;page++){
  let r;try{r=await get(new URL('/products.json?limit=50&page='+page,site.url).href);}catch(e){if(isStopError(e))throw e;await onLog('商品目录读取失败，尝试站点地图：'+e.message);break;}
  if(r?.status!==200)break;
  let catalog;try{catalog=JSON.parse(r.text);}catch{break;}
  if(!Array.isArray(catalog.products))break;shopify=true;
  for(const item of catalog.products){
   if(found>=limit)break;let p=parseShopifyProduct(item,site);if(!p||isMerchandise(p)){skipped++;continue;}
   try{const pageResult=await get(p.url);if(pageResult?.status===200){const detail=parseProductPage(pageResult.text,p.url);if(detail)p={...p,...detail,source_product_id:p.source_product_id,description_text:[p.description_text,detail.description_text].filter(Boolean).join(' ').slice(0,80000),images:detail.images.length?detail.images:p.images,raw_data:{...p.raw_data,...detail.raw_data}};}}catch(e){if(isStopError(e))throw e;await onLog('商品页补充失败：'+e.message);}
   await ingest(p);
  }
  if(catalog.products.length<50)break;
 }
 if(!shopify||found===0){
  const candidates=new Set(),maps=[new URL('/sitemap.xml',site.url).href,...(rules.getSitemaps?.()||[])];const visited=new Set();
  while(maps.length&&visited.size<10&&candidates.size<Math.max(300,limit)){
   const url=maps.shift();if(visited.has(url))continue;visited.add(url);
   try{const r=await get(url);if(r?.status!==200)continue;const parsed=parseSitemap(r.text);maps.push(...parsed.sitemaps.filter(u=>/product|sitemap/i.test(u)).slice(0,8));for(const u of parsed.urls)if(/\/products?\/|\/shop\/|\/p\//i.test(new URL(u).pathname)){validatePublicUrl(u,site.domain);candidates.add(canonicalProductUrl(u));}}catch(e){if(isStopError(e))throw e;await onLog('站点地图跳过：'+e.message);}
  }
  if(!candidates.size){const home=await get(site.url);if(home?.status===200)for(const u of productLinks(home.text,site.url))try{validatePublicUrl(u,site.domain);candidates.add(u);}catch{}}
  for(const url of [...candidates].slice(0,Math.min(1000,limit*4))){if(found>=limit)break;
   try{const r=await get(url);if(r?.status===200)await ingest(parseProductPage(r.text,r.url));}catch(e){if(isStopError(e))throw e;await onLog('商品页跳过：'+e.message);}
  }
 }
 await onLog(found?`采集完成：${found} 件商品，跳过 ${skipped} 件周边商品。`:'未发现可解析商品：站点可能需要登录、动态渲染或专用适配。');
 return {found,skipped,requests,capped:found>=limit,adapter:shopify?'shopify':'sitemap_jsonld'};
}
