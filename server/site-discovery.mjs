import {load} from 'cheerio';
import {getDomain} from 'tldts';
import {randomUUID,createHash} from 'node:crypto';
import {pool,transaction,requireApproved,AppError,jsonValue} from './db.mjs';
import {searchGoogle,searchSettings} from './search-provider.mjs';
import {validatePublicUrl,requestPublic,robotRules,USER_AGENT,canonicalProductUrl} from './network.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const excluded=new Set(['amazon.com','amazon.co.uk','amazon.de','amazon.fr','amazon.ca','amazon.es','amazon.it','ebay.com','ebay.co.uk','walmart.com','iherb.com','aliexpress.com','alibaba.com','temu.com','etsy.com','target.com','vitacost.com','facebook.com','instagram.com','tiktok.com','youtube.com','pinterest.com','reddit.com','linkedin.com','x.com','twitter.com','wikipedia.org','nih.gov','ncbi.nlm.nih.gov','pubmed.ncbi.nlm.nih.gov','mayoclinic.org','webmd.com','healthline.com','medicalnewstoday.com','verywellhealth.com','forbes.com','nytimes.com','clevelandclinic.org','nhs.uk','google.com','google.co.uk','google.de','google.fr','googleusercontent.com','yahoo.com','bing.com','prnewswire.com','businesswire.com','trustpilot.com']);
const digest=v=>createHash('sha256').update(v).digest('hex');
export function discoveryDomain(value){const u=validatePublicUrl(value);const domain=getDomain(u.hostname,{allowPrivateDomains:true});if(!domain)throw new AppError(400,'无法识别公共站点域名');return domain.toLowerCase();}
export function excludedDomain(value){const domain=discoveryDomain(value);const host=new URL(value).hostname.toLowerCase();return /^(amazon|ebay|aliexpress|alibaba|temu|walmart|iherb|etsy|google|yahoo|bing)\./.test(domain)||excluded.has(domain)||[...excluded].some(d=>host===d||host.endsWith('.'+d));}
export function classifyStore(html,url){
 const $=load(html);const structured=[];$('script[type="application/ld+json"]').each((_,el)=>{try{structured.push(JSON.parse($(el).text()));}catch{}});
 const nodes=[];const walk=x=>{if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object'){nodes.push(x);if(x['@graph'])walk(x['@graph']);}};structured.forEach(walk);
 const product=nodes.find(x=>[].concat(x['@type']||[]).includes('Product')&&x.offers);
 $('script,style,noscript').remove();const text=$('body').text().replace(/\s+/g,' ').trim();
 const nutrition=/\bdietary supplements?\b|\bsupplement facts\b|\bnutritional supplements?\b|\bvitamins?\b|\bprobiotics?\b|\bcapsules?\b|\bsoftgels?\b|\bgummies\b|膳食补充剂|保健品|营养补充剂/i.exec(text);
 const cart=/\badd to (?:cart|bag|basket)\b|\bbuy now\b|加入购物车|立即购买/i.exec(text);
 const productLinks=$('a[href]').toArray().map(el=>$(el).attr('href')).filter(h=>/\/products?\/|\/shop\//i.test(h||''));
 const ownPurchase=$('button,input[type="submit"],a').toArray().some(el=>{
  const node=$(el);if(!/\badd to (?:cart|bag|basket)\b|\bbuy now\b|加入购物车|立即购买/i.test(node.text()||node.attr('value')||''))return false;
  const href=node.attr('href');if(!href)return el.tagName!=='a';
  try{return discoveryDomain(new URL(href,url).href)===discoveryDomain(url);}catch{return false;}
 });
 const commerce=Boolean(ownPurchase&&(product||(cart&&productLinks.length)));
 const evidence={supplementMention:nutrition?text.slice(Math.max(0,nutrition.index-80),nutrition.index+160):null,commerce:product?'Product JSON-LD with offer':commerce?'Purchase action and product links':null,checkedUrl:url,method:'store_rules_v1'};
 const brand=String($('meta[property="og:site_name"]').attr('content')||nodes.find(x=>[].concat(x['@type']||[]).some(t=>['Organization','WebSite'].includes(t)))?.name||new URL(url).hostname.replace(/^www\./,'')).slice(0,190);
 return {decision:commerce&&nutrition?'independent':'needs_review',reason:commerce&&nutrition?'页面同时有保健品文本和自营商品购买证据':!nutrition?'保健品品类证据不足':'自营商品购买证据不足',brand,evidence,description:String($('meta[name="description"]').attr('content')||text.slice(0,500)).slice(0,1000)};
}
async function inspectCandidate(row,check,jobId){
 const domain=discoveryDomain(row.url);
 if(excludedDomain(row.url))return {decision:'excluded',reason:'平台、社交、媒体或机构网站，不作为品牌独立站入库',evidence:{domain}};
 const [known]=await pool.query('SELECT id,domain FROM si_sites WHERE domain=? OR domain LIKE ?',[domain,'%.'+domain]);const existing=known.find(s=>getDomain(s.domain,{allowPrivateDomains:true})===domain);
 if(existing)return {decision:'existing',reason:'该独立站已在数据库中',site_id:existing.id,evidence:{domain}};
 const [[cached]]=await pool.query('SELECT decision,reason,evidence,site_id FROM si_discovered_pages WHERE url_hash=? AND decision<>"pending" AND checked_at>UTC_TIMESTAMP()-INTERVAL 1 DAY ORDER BY checked_at DESC LIMIT 1',[row.url_hash]);
 if(cached)return {...cached,evidence:jsonValue(cached.evidence)};
 const site={url:new URL(row.url).origin,domain};await check();const rules=await robotRules(site);
 if(rules.isAllowed(row.url,USER_AGENT)===false)return {decision:'needs_review',reason:'robots.txt 限制页面访问',evidence:{domain}};
 const crawlDelay=rules.getCrawlDelay(USER_AGENT)||0;if(crawlDelay>60)return {decision:'needs_review',reason:'站点要求长采集间隔',evidence:{domain}};
 const response=await requestPublic(row.url,{allowedDomain:domain});if(response.status!==200)return {decision:'needs_review',reason:'页面访问状态 HTTP '+response.status,evidence:{domain}};
 let result=classifyStore(response.text,response.url);
 if(result.decision!=='independent'&&new URL(row.url).pathname!=='/'){
  const home=new URL(response.url).origin+'/';if(rules.isAllowed(home,USER_AGENT)!==false){await delay(Math.max(1000,crawlDelay*1000));await check();const r=await requestPublic(home,{allowedDomain:domain});if(r.status===200){const candidate=classifyStore(r.text,r.url);if(candidate.decision==='independent')result=candidate;}}
 }
 if(result.decision==='independent'){await check();result.site_id=await addDiscoveredSite(result,domain,new URL(response.url).origin+'/',row.url,jobId);}
 return result;
}
async function addDiscoveredSite(result,domain,url,source,jobId){
 return transaction(async c=>{
  const state=await requireApproved(c,true);if(state.allowedSiteIds)throw new AppError(423,'新站点自动入库需要全站点授权','SITE_NOT_APPROVED');
  const [[job]]=await c.query('SELECT status,cancel_requested FROM si_jobs WHERE id=? FOR UPDATE',[jobId]);if(!job||job.cancel_requested||job.status!=='running')throw new AppError(409,'发现任务已停止','JOB_CANCELLED');
  const [[existing]]=await c.query('SELECT id FROM si_sites WHERE domain=?',[domain]);if(existing)return existing.id;
  const [[seq]]=await c.query('SELECT LEAST(COALESCE(MIN(source_key),0),0)-1 source_key,COALESCE(MAX(display_order),0)+1 display_order FROM si_sites');
  const [r]=await c.query('INSERT INTO si_sites (source_key,display_order,brand,url,domain,country,category,intro,main_products,country_note,china_status,china_ops,company_source,source_date,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_DATE(),?)',[seq.source_key,seq.display_order,result.brand,url,domain,'待核验','Google发现 / 保健品',result.description,'待商品采集确认','检索市场不代表公司所在国家','暂无确认线索','未确认',source,'Google自然搜索发现；'+result.reason]);
  await c.query('INSERT IGNORE INTO si_discovery_site_queue (site_id) VALUES (?)',[r.insertId]);
  await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['site_discovered','google_discovery',JSON.stringify({id:r.insertId,domain,source,evidence:result.evidence})]);return r.insertId;
 });
}
export async function createDiscoveryJob({market='us',language='en',keywordIds}={}){
 return transaction(async c=>{
  const state=await requireApproved(c,true);if(state.allowedSiteIds)throw new AppError(423,'请先开放全部站点的采集权限','SITE_NOT_APPROVED');
  const [[active]]=await c.query("SELECT COUNT(*) count FROM si_jobs WHERE job_type='discover' AND status IN ('queued','running','waiting_for_config')");if(active.count)throw new AppError(409,'已有关键词发现任务，请先完成或取消');
  const [keywords]=await c.query('SELECT id,name_zh,name_en FROM si_keywords WHERE enabled=1'+(keywordIds?' AND id IN ('+keywordIds.map(()=>'?').join(',')+')':'')+' ORDER BY id',keywordIds||[]);if(!keywords.length)throw new AppError(400,'没有启用的关键字');
  if(keywordIds&&keywords.length!==new Set(keywordIds).size)throw new AppError(400,'关键字不存在、重复或已停用');
  const options={market,language,pages:3,queries:keywords.map(k=>({id:k.id,name:k.name_zh,query:language==='zh'?k.name_zh:k.name_en}))},id=randomUUID(),status=searchSettings().configured?'queued':'waiting_for_config';
  await c.query('INSERT INTO si_jobs (id,job_type,status,options,progress) VALUES (?,"discover",?,?,?)',[id,status,JSON.stringify(options),JSON.stringify({done:0,total:keywords.length*3,keywords:keywords.length,products:0,results:0,newSites:0,errors:0})]);
  await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['google_discovery_created','local_user',JSON.stringify({id,market,language,keywords:keywords.length,pages:3,maxSearchRequests:keywords.length*3,status})]);return {id,status,keywords:keywords.length,maxSearchRequests:keywords.length*3};
 });
}
async function checkJob(id){await requireApproved();const [[j]]=await pool.query('SELECT status,cancel_requested FROM si_jobs WHERE id=?',[id]);if(!j||j.cancel_requested||j.status!=='running')throw new AppError(409,'搜索发现任务已停止','JOB_CANCELLED');}
const event=(id,message,level='info')=>pool.query('INSERT INTO si_job_events (job_id,level,message) VALUES (?,?,?)',[id,level,message]);
const stopCodes=['JOB_CANCELLED','APPROVAL_REQUIRED','SITE_NOT_APPROVED','SEARCH_CONFIG_REQUIRED','SEARCH_QUOTA_REQUIRED'];
export async function processDiscovery(job,{search=searchGoogle,inspect=inspectCandidate,wait=delay}={}){
 const options=jsonValue(job.options),progress={...(jsonValue(job.progress)||{}),total:options.queries.length*3};
 const check=()=>checkJob(job.id);
 try{
  await event(job.id,'Google 前3页检索开始；市场 '+options.market+'；搜索词语言 '+options.language);
  for(const keyword of options.queries)for(let page=1;page<=3;page++){
   await check();progress.current=keyword.name+' · 第 '+page+' 页';
   const [[stored]]=await pool.query('SELECT * FROM si_search_pages WHERE job_id=? AND keyword_id=? AND page_number=?',[job.id,keyword.id,page]);
   let pageId=stored?.id;
   if(stored?.status!=='completed'){
    try{await wait(1100);await check();const result=await search(keyword.query,page,options.market);await check();
     await transaction(async c=>{
      await requireApproved(c,true);const [[state]]=await c.query('SELECT cancel_requested FROM si_jobs WHERE id=? FOR UPDATE',[job.id]);if(state.cancel_requested)throw new AppError(409,'任务已取消','JOB_CANCELLED');
      const [r]=await c.query('INSERT INTO si_search_pages (job_id,keyword_id,keyword_name,query_text,market,page_number,status,result_count) VALUES (?,?,?,?,?,?,"completed",?) ON DUPLICATE KEY UPDATE status="completed",result_count=VALUES(result_count),error_message=NULL,searched_at=CURRENT_TIMESTAMP',[job.id,keyword.id,keyword.name,keyword.query,options.market,page,result.results.length]);pageId=pageId||r.insertId;
      for(const item of result.results){let domain;try{domain=discoveryDomain(item.url);}catch{continue;}await c.query('INSERT IGNORE INTO si_discovered_pages (search_page_id,url,url_hash,domain,title,snippet,result_rank) VALUES (?,?,?,?,?,?,?)',[pageId,item.url,digest(canonicalProductUrl(item.url)),domain,item.title,item.snippet,item.rank]);}
     });
    }catch(e){if(stopCodes.includes(e.code))throw e;await pool.query('INSERT INTO si_search_pages (job_id,keyword_id,keyword_name,query_text,market,page_number,status,error_message) VALUES (?,?,?,?,?,?,"failed",?) ON DUPLICATE KEY UPDATE status="failed",error_message=VALUES(error_message)',[job.id,keyword.id,keyword.name,keyword.query,options.market,page,e.message]);await event(job.id,progress.current+' · '+e.message,'error');continue;}
   }
   const [pending]=await pool.query('SELECT * FROM si_discovered_pages WHERE search_page_id=? AND decision="pending" ORDER BY result_rank',[pageId]);
   for(const row of pending){await check();let decision;
    try{decision=await inspect(row,check,job.id);}catch(e){if(stopCodes.includes(e.code))throw e;decision={decision:'needs_review',reason:'页面核验失败，需人工复核',evidence:{errorCode:e.code||'FETCH_FAILED'}};}
    await pool.query('UPDATE si_discovered_pages SET decision=?,reason=?,evidence=?,site_id=?,checked_at=CURRENT_TIMESTAMP WHERE id=?',[decision.decision,decision.reason,JSON.stringify(decision.evidence||{}),decision.site_id||null,row.id]);
   }
   await updateProgress(job.id,progress);await event(job.id,progress.current+' · 检索与站点核验完成');
  }
  await updateProgress(job.id,progress);await check();await pool.query('UPDATE si_jobs SET status=?,finished_at=CURRENT_TIMESTAMP WHERE id=?',[progress.errors?'completed_with_errors':'completed',job.id]);await event(job.id,'关键词搜索完成；新站点商品在采集队列中继续处理');
 }catch(e){const waiting=['SEARCH_CONFIG_REQUIRED','SEARCH_QUOTA_REQUIRED'].includes(e.code);await updateProgress(job.id,progress);await pool.query('UPDATE si_jobs SET status=?,error_message=?,finished_at=IF(?,NULL,CURRENT_TIMESTAMP) WHERE id=?',[waiting?'waiting_for_config':stopCodes.includes(e.code)?'cancelled':'failed',stopCodes.includes(e.code)?e.message:'搜索任务失败，请查看任务状态',waiting,job.id]);await event(job.id,waiting?e.message:'任务停止',waiting?'warning':'error');}
}
async function updateProgress(id,progress){
 const [[pages]]=await pool.query('SELECT COUNT(*) done,SUM(status="failed") errors FROM si_search_pages WHERE job_id=?',[id]);
 const [[results]]=await pool.query('SELECT COUNT(*) results,COUNT(DISTINCT IF(d.decision="independent",d.site_id,NULL)) newSites FROM si_discovered_pages d JOIN si_search_pages sp ON sp.id=d.search_page_id WHERE sp.job_id=?',[id]);
 Object.assign(progress,pages,results);await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify(progress),id]);
}
export async function dispatchDiscoveryCrawls(createJob){
 const [[{active}]]=await pool.query("SELECT COUNT(*) active FROM si_jobs WHERE job_type<>'discover' AND status IN ('running','queued')");if(active>=4)return;
 const [rows]=await pool.query('SELECT site_id FROM si_discovery_site_queue WHERE status="pending" ORDER BY created_at LIMIT 50');if(!rows.length)return;
 const {id}=await createJob('crawl',{siteIds:rows.map(r=>r.site_id),limitPerSite:1000,useAi:true});await pool.query('UPDATE si_discovery_site_queue SET status="queued",job_id=? WHERE site_id IN ('+rows.map(()=>'?').join(',')+') AND status="pending"',[id,...rows.map(r=>r.site_id)]);
}
export async function discoveryOverview(q={}){
 const page=Math.max(1,Math.min(100000,parseInt(q.page)||1)),limit=25,clauses=[],args=[];
 if(q.search){clauses.push('(d.domain LIKE ? OR sp.keyword_name LIKE ? OR d.title LIKE ?)');args.push(...Array(3).fill('%'+String(q.search).slice(0,200)+'%'));}
 if(['independent','existing','excluded','needs_review','pending'].includes(q.decision)){clauses.push('d.decision=?');args.push(q.decision);}
 const from=' FROM si_discovered_pages d JOIN si_search_pages sp ON sp.id=d.search_page_id LEFT JOIN si_sites s ON s.id=d.site_id LEFT JOIN si_discovery_site_queue sq ON sq.site_id=d.site_id LEFT JOIN si_jobs cj ON cj.id=sq.job_id',where=clauses.length?' WHERE '+clauses.join(' AND '):'';
 const [[{total}]]=await pool.query('SELECT COUNT(*) total'+from+where,args);
 const [rows]=await pool.query('SELECT d.*,sp.keyword_name,sp.query_text,sp.market,sp.page_number,sp.searched_at,s.brand,sq.status crawl_queue_status,cj.status crawl_job_status,(SELECT COUNT(*) FROM si_products p WHERE p.site_id=d.site_id) products'+from+where+' ORDER BY d.id DESC LIMIT ? OFFSET ?',[...args,limit,(page-1)*limit]);
 const [[counts]]=await pool.query('SELECT (SELECT COUNT(*) FROM si_search_pages WHERE status="completed") searchedPages,(SELECT COUNT(*) FROM si_discovered_pages) results,(SELECT COUNT(DISTINCT site_id) FROM si_discovered_pages WHERE decision="independent") newSites,(SELECT COUNT(*) FROM si_discovered_pages WHERE decision="needs_review") pendingReview');
 const [jobs]=await pool.query('SELECT * FROM si_jobs WHERE job_type="discover" ORDER BY created_at DESC LIMIT 5');
 return {settings:searchSettings(),counts,rows:rows.map(r=>({...r,evidence:jsonValue(r.evidence)})),total,page,limit,jobs:jobs.map(j=>({...j,options:undefined,progress:jsonValue(j.progress)}))};
}
let timer,busy=false,stopping=false;
export async function recoverDiscoveryJobs(){await pool.query('UPDATE si_jobs SET status="queued" WHERE job_type="discover" AND status="running" AND cancel_requested=0');}
async function tick(){if(busy||stopping||!searchSettings().configured)return;busy=true;try{await requireApproved();const [[job]]=await pool.query('SELECT * FROM si_jobs WHERE job_type="discover" AND status="queued" AND cancel_requested=0 ORDER BY created_at LIMIT 1');if(!job)return;const [r]=await pool.query('UPDATE si_jobs SET status="running",started_at=COALESCE(started_at,CURRENT_TIMESTAMP),error_message=NULL WHERE id=? AND status="queued"',[job.id]);if(r.affectedRows)await processDiscovery(job);}catch(e){console.error('搜索发现处理失败:',e.code||'ERROR');}finally{busy=false;}}
export function startDiscoveryWorker(){timer=setInterval(tick,5000);timer.unref();tick();}
export function stopDiscoveryWorker(){stopping=true;clearInterval(timer);}
