import {randomUUID} from 'node:crypto';
import {pool,jsonValue,requireApproved,requireSiteApproved,assertSiteAllowed,transaction,AppError} from './db.mjs';
import {crawlSite} from './crawler.mjs';
import {analyzeProduct,analyzeTikTokRecord} from './analysis.mjs';
import {saveProduct,productDetail,replaceIngredients} from './repository.mjs';
import {config} from './config.mjs';
import {beginSiteRun,updateRunProgress,finishSiteRun} from './site-runs.mjs';
import {syncProductKeywords} from './keywords.mjs';
import {searchSecret} from './search-provider.mjs';
import {dispatchDiscoveryCrawls} from './site-discovery.mjs';

export function safeError(e){let s=String(e?.message||e);for(const secret of [config.db.password,config.ai.key,searchSecret()])if(secret)s=s.replaceAll(secret,'[redacted]');return s.slice(0,600);}
export async function createJob(type,options,{claimImmediately=false}={}){
 return transaction(async c=>{
  const state=await requireApproved(c,true);
  if(!['crawl','analyze','match'].includes(type))throw new AppError(400,'任务类型不支持');
  const ids=type==='crawl'?options.siteIds:options.productIds;
  const table=type==='crawl'?'si_sites':'si_products';
  const [known]=await c.query('SELECT id'+(type!=='crawl'?',site_id':'')+' FROM '+table+' WHERE id IN ('+ids.map(()=>'?').join(',')+')',ids);
  if(known.length!==ids.length)throw new AppError(400,'所选记录不存在或重复');
  assertSiteAllowed(state,type==='crawl'?ids:known.map(r=>r.site_id));
  const [[{active}]]=await c.query("SELECT COUNT(*) active FROM si_jobs WHERE job_type<>'discover' AND status IN ('queued','running')");
  if(active>=5)throw new AppError(409,'已有5个待处理任务，请等待完成');
  const id=randomUUID(),status=claimImmediately?'running':'queued';await c.query('INSERT INTO si_jobs (id,job_type,options,progress,status,started_at) VALUES (?,?,?,?,?,IF(?="running",CURRENT_TIMESTAMP,NULL))',[id,type,JSON.stringify(options),JSON.stringify({done:0,total:ids.length,products:0}),status,status]);
  await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['job_created','local_user',JSON.stringify({id,type,options})]);return {id};
 });
}
async function check(id){
 await requireApproved();const [[job]]=await pool.query('SELECT status,cancel_requested FROM si_jobs WHERE id=?',[id]);
 if(!job||job.cancel_requested||job.status!=='running')throw new AppError(409,'任务已取消','JOB_CANCELLED');
}
const event=(id,message,level='info')=>pool.query('INSERT INTO si_job_events (job_id,level,message) VALUES (?,?,?)',[id,level,message.slice(0,3000)]);
export async function processClaimedJob(job){
  const options=jsonValue(job.options),progress={done:0,total:(options.siteIds||options.productIds).length,products:0,errors:0},results=[];
  try{
   await event(job.id,'任务开始');
   if(job.job_type==='crawl')for(const siteId of options.siteIds){
    await check(job.id);const [[site]]=await pool.query('SELECT * FROM si_sites WHERE id=?',[siteId]);progress.current=site.brand;
    const run=await beginSiteRun(siteId,job.id,'crawl');let processed=0;
    await event(job.id,`${site.brand} · 第 ${run.run_number} 次分析开始`);
    try{const result=await crawlSite(site,{limit:options.limitPerSite,check:async()=>{await check(job.id);await requireSiteApproved(siteId);},onLog:m=>event(job.id,site.brand+' · '+m),onProduct:async p=>{const analysis=await analyzeProduct(p,{useAi:options.useAi});await check(job.id);await saveProduct(site,p,analysis,job.id);processed++;progress.products++;await updateRunProgress(run.id,processed);await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify(progress),job.id]);}});await finishSiteRun(run.id,result.found?'completed':'no_products',{products:processed,result});results.push({siteId,brand:site.brand,runNumber:run.run_number,...result});}
    catch(e){const cancelled=['APPROVAL_REQUIRED','SITE_NOT_APPROVED','JOB_CANCELLED'].includes(e.code);await finishSiteRun(run.id,cancelled?'cancelled':'failed',{products:processed,error:safeError(e)});if(cancelled)throw e;progress.errors++;await event(job.id,site.brand+' · '+safeError(e),'error');results.push({siteId,error:safeError(e)});}
    progress.done++;await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify(progress),job.id]);
   }
   else if(job.job_type==='match'){
    for(const id of options.productIds){await check(job.id);await transaction(async c=>{const [[p]]=await c.query('SELECT * FROM si_products WHERE id=? FOR UPDATE',[id]);if(p){await requireSiteApproved(p.site_id,c,true);await syncProductKeywords(c,id,p);}});progress.done++;progress.products++;if(progress.done%20===0)await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify(progress),job.id]);}
    await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify(progress),job.id]);
   }
   else {
    const runs=new Map();
    try{for(const id of options.productIds){
     await check(job.id);const product=await productDetail(id);
     if(product.site_id&&!runs.has(product.site_id))runs.set(product.site_id,{...await beginSiteRun(product.site_id,job.id,'analyze'),processed:0});
     const run=runs.get(product.site_id);const analysis=product.source_platform==='tiktok'&&jsonValue(product.raw_data)?.content_scope==='listing_title'?await analyzeTikTokRecord({...product,description_text:''}):await analyzeProduct(product,{useAi:options.useAi});
     await transaction(async c=>{await requireSiteApproved(product.site_id,c,true);const [[jobState]]=await c.query('SELECT cancel_requested FROM si_jobs WHERE id=? FOR UPDATE',[job.id]);if(jobState.cancel_requested)throw new AppError(409,'任务已取消','JOB_CANCELLED');await c.query('UPDATE si_products SET name_zh=?,translation_status=?,dosage_form=?,serving_size=?,analysis_status=?,analysis=? WHERE id=?',[analysis.name_zh,analysis.translation_status,analysis.dosage_form,analysis.serving_size||null,analysis.analysis_status,JSON.stringify(analysis),id]);await replaceIngredients(c,id,analysis.ingredients);await syncProductKeywords(c,id,product);});
     if(run){run.processed++;await updateRunProgress(run.id,run.processed);}progress.done++;progress.products++;await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify(progress),job.id]);
    }
    for(const [siteId,run] of runs){await finishSiteRun(run.id,'completed',{products:run.processed});results.push({siteId,runNumber:run.run_number,products:run.processed});}
    }catch(e){for(const run of runs.values())await finishSiteRun(run.id,['APPROVAL_REQUIRED','SITE_NOT_APPROVED','JOB_CANCELLED'].includes(e.code)?'cancelled':'failed',{products:run.processed,error:safeError(e)});throw e;}
   }
   await check(job.id);
   await pool.query("UPDATE si_jobs SET status=?,result=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",[progress.errors?'completed_with_errors':'completed',JSON.stringify(results),job.id]);await event(job.id,'任务完成');
  }catch(e){const status=['APPROVAL_REQUIRED','SITE_NOT_APPROVED','JOB_CANCELLED'].includes(e.code)?'cancelled':'failed';await pool.query('UPDATE si_jobs SET status=?,error_message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?',[status,safeError(e),job.id]);await event(job.id,safeError(e),'error');}
}
let busy=false,stopping=false,timer;
async function tick(){
 if(busy||stopping)return;busy=true;
 try{
  await requireApproved();
  await dispatchDiscoveryCrawls(createJob);
  const [[job]]=await pool.query("SELECT * FROM si_jobs WHERE job_type<>'discover' AND status='queued' AND cancel_requested=0 ORDER BY created_at LIMIT 1");if(!job)return;
  const [claim]=await pool.query("UPDATE si_jobs SET status='running',started_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'",[job.id]);if(!claim.affectedRows)return;
  await processClaimedJob(job);
 }catch(e){if(e.code!=='APPROVAL_REQUIRED')console.error('任务处理失败:',e.code||'ERROR');}finally{busy=false;}
}
export async function startWorker(){
 await pool.query("UPDATE si_site_analysis_runs SET status='interrupted',error_message='服务重启，分析中断',finished_at=CURRENT_TIMESTAMP WHERE status='running'");
 await pool.query("UPDATE si_jobs SET status='cancelled',error_message='服务重启，任务已停止，请重新创建',finished_at=CURRENT_TIMESTAMP WHERE status='running'");
 timer=setInterval(tick,10000);timer.unref();tick();
}
export async function stopWorker(){stopping=true;clearInterval(timer);await pool.query("UPDATE si_jobs SET cancel_requested=1 WHERE status='running'");}
export async function listJobs(){const [rows]=await pool.query('SELECT * FROM si_jobs ORDER BY created_at DESC LIMIT 100');return rows.map(r=>({...r,options:jsonValue(r.options),progress:jsonValue(r.progress),result:jsonValue(r.result)}));}
