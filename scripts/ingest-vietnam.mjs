import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {pool,transaction,requireApproved,requireSiteApproved,jsonValue} from '../server/db.mjs';
import {createJob,safeError} from '../server/jobs.mjs';
import {beginSiteRun,finishSiteRun,updateRunProgress} from '../server/site-runs.mjs';
import {robotRules,USER_AGENT} from '../server/network.mjs';
import {parseProductPage} from '../server/parser.mjs';
import {analyzeProduct} from '../server/analysis.mjs';
import {saveProduct} from '../server/repository.mjs';
import {vietnameseKeywords} from '../server/vietnamese.mjs';
import {invalidateKeywords} from '../server/keywords.mjs';
import {researchRequest} from './vietnam-fetch.mjs';
const manifest=JSON.parse(await fs.readFile(new URL('../data/vietnam-batch-2026-10-14.json',import.meta.url)));
const report={batch:manifest.batch,scope:manifest.scope,startedAt:new Date().toISOString(),sites:[]};
let jobId;
try{
 await fs.mkdir('logs/vietnam',{recursive:true});
 await requireApproved();
 const [[previous]]=await pool.query("SELECT id,status FROM si_jobs WHERE JSON_UNQUOTE(JSON_EXTRACT(options,'$.batch'))=? LIMIT 1",[manifest.batch]);
 if(previous)throw new Error('Batch already exists: '+previous.id+' '+previous.status);
 const siteIds=await transaction(async c=>{
  const approval=await requireApproved(c,true);if(approval.allowedSiteIds)throw new Error('Batch requires unrestricted site ingestion approval');
  const ids=[];
  for(const s of manifest.sites){
   const [[existing]]=await c.query('SELECT id FROM si_sites WHERE domain=?',[s.domain]);if(existing){ids.push(existing.id);continue;}
   const [[seq]]=await c.query('SELECT LEAST(COALESCE(MIN(source_key),0),0)-1 source_key,COALESCE(MAX(display_order),0)+1 display_order FROM si_sites');
   const [r]=await c.query('INSERT INTO si_sites (source_key,display_order,brand,url,domain,country,category,intro,main_products,public_address,address_type,country_note,china_status,china_ops,china_summary,company_source,source_date,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[seq.source_key,seq.display_order,s.brand,s.url,s.domain,s.country,s.category,s.intro,s.main_products,s.public_address,s.address_type,s.country_note,'暂无确认线索','未确认','未找到可验证的中国股权或中国团队运营依据。',s.company_source,s.source_date,manifest.scope]);ids.push(r.insertId);
  }
  let aliasesAdded=0;
  for(const [name,aliases] of Object.entries(vietnameseKeywords)){
   const [[k]]=await c.query("SELECT id,aliases FROM si_keywords WHERE name_zh=? AND keyword_type='topic' FOR UPDATE",[name]);if(!k)continue;
   const old=jsonValue(k.aliases)||[],merged=[...new Set([...old,...aliases])];aliasesAdded+=merged.length-old.length;await c.query('UPDATE si_keywords SET aliases=? WHERE id=?',[JSON.stringify(merged),k.id]);
  }
  report.aliasesAdded=aliasesAdded;await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['vietnam_batch_registered','local_user',JSON.stringify({batch:manifest.batch,siteIds:ids,aliasesAdded,scope:manifest.scope})]);return ids;
 });invalidateKeywords();
 ({id:jobId}=await createJob('crawl',{siteIds,limitPerSite:20,useAi:false,batch:manifest.batch,scope:manifest.scope},{claimImmediately:true}));report.jobId=jobId;
 const event=(message,level='info')=>pool.query('INSERT INTO si_job_events (job_id,level,message) VALUES (?,?,?)',[jobId,level,message]);
 let done=0,totalProducts=0;
 for(let index=0;index<manifest.sites.length;index++){
  const s={...manifest.sites[index],id:siteIds[index]},result={siteId:s.id,brand:s.brand,products:0,attempted:s.products.length,failures:[]};
  const run=await beginSiteRun(s.id,jobId,'crawl');result.runNumber=run.run_number;
  const check=async()=>{await requireSiteApproved(s.id);const [[j]]=await pool.query('SELECT status,cancel_requested FROM si_jobs WHERE id=?',[jobId]);if(j.status!=='running'||j.cancel_requested)throw new Error('Batch stopped');};
  try{
   await event(s.brand+' · 第 '+run.run_number+' 次分析开始；'+manifest.scope);
   const rules=await robotRules(s,researchRequest),interval=Math.max(1000,(rules.getCrawlDelay(USER_AGENT)||0)*1000);if(interval>60000)throw new Error('Long crawl delay: deferred');
   for(const candidate of s.products){
    await check();await delay(interval);
    try{
     if(rules.isAllowed(candidate.url,USER_AGENT)===false)throw new Error('robots.txt disallows URL');
     const r=await researchRequest(candidate.url,{allowedDomain:s.domain});if(r.status!==200)throw new Error('HTTP '+r.status);
     const p=parseProductPage(r.text,r.url);if(!p)throw new Error('No verified product metadata');
     if(/doxylamine|diphenhydramine|tranexamic|iberogast|acetaminophen|cetirizine/i.test(p.name_original+' '+p.description_text))throw new Error('Excluded medicine; not treated as supplement');
     p.raw_data={...p.raw_data,research_batch:manifest.batch,listing_source:s.url};
     const a=await analyzeProduct(p,{useAi:false});a.warnings.push('越南市场首批商品样本；不代表整站目录或销量。');
     await check();const saved=await saveProduct(s,p,a,jobId);result.products++;totalProducts++;
     await updateRunProgress(run.id,result.products);console.log(JSON.stringify({site:s.brand,name:p.name_original,id:saved?.id||saved,count:result.products}));
    }catch(e){const message=safeError(e);result.failures.push({url:candidate.url,error:message});await event(s.brand+' · '+message,'warning');}
    await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify({done,total:siteIds.length,products:totalProducts,current:s.brand}),jobId]);
   }
   await finishSiteRun(run.id,result.failures.length?'failed':result.products?'completed':'no_products',{products:result.products,result,error:result.failures.length?'部分商品未完成，参见采集任务日志':null});
  }catch(e){result.failures.push({error:safeError(e)});await finishSiteRun(run.id,'failed',{products:result.products,result,error:safeError(e)});}
  done++;report.sites.push(result);await event(s.brand+' · 本次已录入 '+result.products+' 件；失败 '+result.failures.length+' 项');
  await fs.writeFile('logs/vietnam/batch-report.json',JSON.stringify(report,null,2));
 }
 report.finishedAt=new Date().toISOString();report.totalProducts=totalProducts;
 const errors=report.sites.reduce((n,s)=>n+s.failures.length,0);await pool.query('UPDATE si_jobs SET status=?,result=?,progress=?,finished_at=CURRENT_TIMESTAMP WHERE id=?',[errors?'completed_with_errors':'completed',JSON.stringify(report.sites),JSON.stringify({done,total:siteIds.length,products:totalProducts,errors}),jobId]);
 await fs.writeFile('logs/vietnam/batch-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){if(jobId)await pool.query("UPDATE si_jobs SET status='failed',error_message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",[safeError(e),jobId]);console.error(safeError(e));process.exitCode=1;}finally{await pool.end();}
