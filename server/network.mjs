import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import robotsParser from 'robots-parser';
import {AppError} from './db.mjs';

export const USER_AGENT='NutraScopeResearch/1.0';
export function isPublicAddress(address){
 const family=net.isIP(address);
 if(family===4){
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||(b===88&&c===99)))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0&&c===113));
 }
 if(family===6){
  const v=address.toLowerCase();
  if(v.startsWith('::ffff:'))return isPublicAddress(v.slice(7));
  return /^[23]/.test(v)&&!v.startsWith('2001:db8:')&&!v.startsWith('2001:0:')&&!v.startsWith('2002:');
 }
 return false;
}
export function validatePublicUrl(value,allowedDomain){
 const u=new URL(value);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!['','80','443'].includes(u.port))throw new AppError(400,'只支持公共网站的标准HTTP/HTTPS地址','INVALID_URL');
 const hostname=u.hostname.replace(/^\[|\]$/g,'');
 if(net.isIP(hostname)&&!isPublicAddress(hostname))throw new AppError(400,'不能访问内部网络地址','PRIVATE_ADDRESS');
 if(u.hostname==='localhost'||u.hostname.endsWith('.local'))throw new AppError(400,'不能访问内部网络地址','PRIVATE_ADDRESS');
 if(allowedDomain){
  const host=u.hostname.replace(/^www\./,'');
  const base=allowedDomain.replace(/^www\./,'');
  if(host!==base&&!host.endsWith('.'+base))throw new AppError(400,'地址必须属于所选独立站','HOST_MISMATCH');
 }
 return u;
}
function publicLookup(host,options,callback){
 dns.lookup(host,{all:true},(error,addresses)=>{
  if(error)return callback(error);
  if(!addresses.length||addresses.some(r=>!isPublicAddress(r.address)))return callback(new Error('拒绝内部网络DNS地址'));
  if(options?.all)return callback(null,addresses);
  const chosen=addresses.find(r=>r.family===4)||addresses[0];callback(null,chosen.address,chosen.family);
 });
}
export async function requestPublic(value,{allowedDomain,maxBytes=3_000_000,timeout=18000,redirects=0}={}){
 const u=validatePublicUrl(value,allowedDomain);
 if(redirects>5)throw new Error('网站重定向次数过多');
 const result=await new Promise((resolve,reject)=>{
  const transport=u.protocol==='https:'?https:http;
  const req=transport.request(u,{method:'GET',lookup:publicLookup,headers:{'User-Agent':USER_AGENT,'Accept':'text/html,application/json,application/xml,image/*;q=0.8','Accept-Encoding':'identity','Accept-Language':'en-US,en;q=0.8'},agent:false},res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('页面超过采集大小限制'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),url:u.href}));res.on('error',reject);
  });
  const deadline=setTimeout(()=>req.destroy(new Error('网站响应超时')),timeout);
  req.on('close',()=>clearTimeout(deadline));req.on('error',reject);req.end();
 });
 if([301,302,303,307,308].includes(result.status)&&result.headers.location)return requestPublic(new URL(result.headers.location,u).href,{allowedDomain,maxBytes,timeout,redirects:redirects+1});
 return {...result,text:result.body.toString('utf8')};
}
const robotCache=new Map();
export async function robotRules(site,request=requestPublic){
 const origin=new URL(site.url).origin;
 if(robotCache.has(origin)&&robotCache.get(origin).expires>Date.now())return robotCache.get(origin).rules;
 const url=origin+'/robots.txt';
 const r=await request(url,{allowedDomain:site.domain,maxBytes:200000});
 if(![200,404,410].includes(r.status))throw new Error(`robots.txt无法确认（HTTP ${r.status}），暂停该站采集`);
 const rules=robotsParser(url,r.status===200?r.text:'');
 robotCache.set(origin,{rules,expires:Date.now()+3600000});return rules;
}
export function canonicalProductUrl(value){
 const u=new URL(value);u.hash='';
 for(const key of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid|variant$|ref$|srsltid)/i.test(key))u.searchParams.delete(key);
 u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.href;
}
