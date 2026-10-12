import fs from 'node:fs/promises';
import path from 'node:path';
import {appRoot} from './config.mjs';
import {AppError} from './db.mjs';

const file=path.join(appRoot,'.search-config.json');
let key=process.env.SERPAPI_API_KEY||'';
try{const stored=JSON.parse(await fs.readFile(file,'utf8'));if(stored.apiKey)key=stored.apiKey;}catch(e){if(e.code!=='ENOENT')console.error('搜索配置读取失败');}
export function searchSettings(){return {provider:'serpapi',engine:'google',configured:Boolean(key),pagesPerKeyword:3};}
export const searchSecret=()=>key;
export async function saveSearchKey(apiKey){
 await fs.writeFile(file,JSON.stringify({apiKey}),{mode:0o600});key=apiKey;return searchSettings();
}
export function googleParameters(query,page,market){
 if(!Number.isInteger(page)||page<1||page>3)throw new AppError(400,'搜索页码必须为1至3');
 return {engine:'google',q:query,google_domain:market==='gb'?'google.co.uk':market==='de'?'google.de':market==='fr'?'google.fr':'google.com',gl:market,hl:market==='de'?'de':market==='fr'?'fr':'en',start:String((page-1)*10)};
}
export function parseSearchResponse(body,page){
 if(body.error)throw new AppError(502,'搜索服务返回错误，请检查密钥、额度或服务状态','SEARCH_PROVIDER_ERROR');
 if(!Array.isArray(body.organic_results)&&!body.search_information?.organic_results_state)throw new AppError(502,'搜索结果结构异常，未计为成功','SEARCH_INVALID_RESPONSE');
 return (body.organic_results||[]).filter(r=>typeof r.link==='string').slice(0,10).map((r,i)=>({url:r.link,title:String(r.title||'').slice(0,512),snippet:String(r.snippet||'').slice(0,4000),rank:Number(r.position)>10?Number(r.position):(page-1)*10+(Number(r.position)||i+1)}));
}
export async function searchGoogle(query,page,market,{fetcher=fetch,apiKey=key}={}){
 if(!apiKey)throw new AppError(423,'需要配置 SerpAPI 密钥后才能检索 Google','SEARCH_CONFIG_REQUIRED');
 const url=new URL('https://serpapi.com/search.json');url.search=new URLSearchParams({...googleParameters(query,page,market),api_key:apiKey}).toString();
 let response;
 try{response=await fetcher(url,{signal:AbortSignal.timeout(40000),redirect:'error'});}catch{throw new AppError(502,'Google 搜索服务连接失败或超时','SEARCH_NETWORK_ERROR');}
 if([401,403].includes(response.status))throw new AppError(423,'SerpAPI 密钥或访问权限无效','SEARCH_CONFIG_REQUIRED');
 if(response.status===429)throw new AppError(423,'SerpAPI 额度或速率受限，任务已等待配置','SEARCH_QUOTA_REQUIRED');
 if(!response.ok)throw new AppError(502,'搜索服务暂时不可用（HTTP '+response.status+'）','SEARCH_PROVIDER_ERROR');
 let body;try{body=await response.json();}catch{throw new AppError(502,'搜索服务未返回有效 JSON','SEARCH_INVALID_RESPONSE');}
 // Provider errors can include request secrets. Never forward their raw text.
 if(body.error&&/key|credit|quota|limit|payment|plan/i.test(body.error))throw new AppError(423,'请检查 SerpAPI 密钥和可用额度','SEARCH_CONFIG_REQUIRED');
 return {results:parseSearchResponse(body,page),searchId:String(body.search_metadata?.id||''),source:'serpapi/google'};
}
