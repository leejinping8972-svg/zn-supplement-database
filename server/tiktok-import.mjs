import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction,requireApproved,AppError} from './db.mjs';
import {safeError} from './jobs.mjs';
import {analyzeProduct} from './analysis.mjs';
import {replaceIngredients} from './repository.mjs';
import {syncProductKeywords,compileKeywords,matchKeywords} from './keywords.mjs';
import {validatePublicUrl} from './network.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const publicUrl=z.string().url().refine(v=>{try{validatePublicUrl(v);return true;}catch{return false;}},'必须为公开网页地址');
export const tiktokRecord=z.object({
 platform_product_id:z.string().min(1).max(190),name_original:z.string().min(1).max(512),
 shop_name:z.string().min(1).max(190),shop_url:publicUrl.nullable().default(null),
 platform_country:z.string().min(1).max(190),country_evidence:z.string().min(1).max(1500),
 product_url:publicUrl.nullable().default(null),research_url:publicUrl,
 description_text:z.string().max(80000).default(''),price:z.number().nonnegative().nullable().default(null),
 currency:z.string().max(8).nullable().default(null),images:z.array(publicUrl).max(12).default([])
}).strict();
export function prepareTikTokRecord(input){
 const r=tiktokRecord.parse(input);
 if(/待确认|未知|unknown/i.test(r.platform_country))throw new Error('TikTok国家站点必须有明确页面依据');
 if(r.product_url&&!/(^|\.)tiktok\.com$/.test(new URL(r.product_url).hostname))throw new Error('商品链接必须为实际观察到的 TikTok 链接；研究页请放入 research_url');
 return {...r,url:r.product_url||r.research_url,source_identity:hash('tiktok\n'+r.platform_country+'\n'+r.platform_product_id)};
}
export function conceptMatches(product,keywords){
 const topics=keywords.filter(k=>k.keyword_type==='topic');
 return matchKeywords(product,compileKeywords(topics)).filter(m=>m.evidence_scope!=='warning_or_negation').map(m=>({name_zh:topics.find(k=>k.id===m.keyword_id).name_zh,evidence_text:m.evidence_text,method:'explicit_topic_mention'}));
}
export async function importTikTokRecords(input,{sourcePage,expectedCount}={}){
 if(sourcePage!==undefined)sourcePage=publicUrl.parse(sourcePage);
 if(expectedCount!==undefined)expectedCount=z.number().int().positive().parse(expectedCount);
 const records=z.array(z.unknown()).min(1).parse(input).map(prepareTikTokRecord);
 if(!records.length)throw new Error('没有可导入商品');
 if(new Set(records.map(r=>r.source_identity)).size!==records.length)throw new Error('输入存在重复商品，请先核对分页结果');
 if(expectedCount!==undefined&&records.length!==expectedCount)throw new Error('采集数量与筛选结果总数不符，不标记全量完成');
 const approval=await requireApproved();if(approval.allowedSiteIds)throw new Error('当前授权仅限部分独立站，不能导入平台商品');
 const [keywords]=await pool.query('SELECT * FROM si_keywords WHERE enabled=1');
 const batchId=randomUUID();const result={batchId,expectedCount:expectedCount??null,processed:0,created:0,updated:0};
 await pool.query('INSERT INTO si_jobs (id,job_type,status,options,progress,started_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',[batchId,'tiktok_import','running',JSON.stringify({sourcePage,total:records.length}),JSON.stringify(result)]);
 const log=(message,level='info')=>pool.query('INSERT INTO si_job_events (job_id,level,message) VALUES (?,?,?)',[batchId,level,message]);
 try{
  await log('TikTok商品导入开始，共 '+records.length+' 件；仅依据已观察到的页面资料分析。');
  await pool.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['tiktok_import_started','local_user',JSON.stringify({batchId,sourcePage,total:records.length})]);
  for(const r of records){
   const product={name_original:r.name_original,description_text:r.description_text,raw_data:{source:'echotik_observed_page',research_url:r.research_url},url:r.url};
   const analysis=await analyzeProduct(product,{useAi:false});const concepts=conceptMatches(product,keywords);
   if(!r.description_text)analysis.warnings.push('仅采集到商品列表标题，缺少详情或标签，不能确认配方。');
   const changed=await transaction(async c=>{
    const state=await requireApproved(c,true);if(state.allowedSiteIds)throw new Error('平台导入权限已改变');
    const [[job]]=await c.query('SELECT status,cancel_requested FROM si_jobs WHERE id=? FOR UPDATE',[batchId]);if(!job||job.cancel_requested||job.status!=='running')throw new AppError(409,'导入已取消','JOB_CANCELLED');
    const [[old]]=await c.query('SELECT id,analysis_status FROM si_products WHERE source_identity=? FOR UPDATE',[r.source_identity]);
    if(old?.analysis_status==='reviewed')throw new Error('该商品已人工审核，需单独复核后更新');
    const content_hash=hash(JSON.stringify(r));
    const fields={source_platform:'tiktok',site_id:null,shop_name:r.shop_name,shop_url:r.shop_url,platform_country:r.platform_country,platform_product_id:r.platform_product_id,research_url:r.research_url,source_identity:r.source_identity,concepts:JSON.stringify(concepts),sales_country:r.platform_country,sales_country_basis:'按 TikTok 商品国家站点记录；'+r.country_evidence,sales_country_source_url:r.research_url,url:r.url,url_hash:hash(r.url),name_original:r.name_original,name_zh:analysis.name_zh,translation_status:analysis.translation_status,description_text:r.description_text,price:r.price,currency:r.currency,dosage_form:analysis.dosage_form,serving_size:analysis.serving_size||null,source_product_id:r.platform_product_id,analysis_status:analysis.analysis_status,analysis:JSON.stringify(analysis),raw_data:JSON.stringify({...product.raw_data,product_url:r.product_url,country_evidence:r.country_evidence}),content_hash};
    let id=old?.id;
    if(id)await c.query('UPDATE si_products SET '+Object.keys(fields).map(k=>k+'=?').join(',')+',last_seen_at=CURRENT_TIMESTAMP WHERE id=?',[...Object.values(fields),id]);
    else{const [saved]=await c.query('INSERT INTO si_products ('+Object.keys(fields).join(',')+') VALUES ('+Object.keys(fields).map(()=>'?').join(',')+')',Object.values(fields));id=saved.insertId;}
    await c.query('DELETE FROM si_product_images WHERE product_id=?',[id]);
    for(const [order,url] of r.images.entries())await c.query('INSERT INTO si_product_images (product_id,image_url,alt_text,sort_order) VALUES (?,?,?,?)',[id,url,r.name_original,order]);
    await replaceIngredients(c,id,analysis.ingredients);await syncProductKeywords(c,id,product);
    await c.query('INSERT IGNORE INTO si_product_snapshots (product_id,content_hash,snapshot) VALUES (?,?,?)',[id,content_hash,JSON.stringify({product:r,analysis,concepts})]);
    return Boolean(old);
   });
   result.processed++;result[changed?'updated':'created']++;
   await log((changed?'更新':'新增')+'商品 '+r.platform_product_id+' · '+r.shop_name+' · '+r.platform_country);
   await pool.query('UPDATE si_jobs SET progress=? WHERE id=?',[JSON.stringify({...result,done:result.processed,total:records.length,products:result.processed}),batchId]);
  }
  await pool.query("UPDATE si_jobs SET status='completed',result=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",[JSON.stringify(result),batchId]);
  await log('导入完成：新增 '+result.created+' 件，更新 '+result.updated+' 件。');
  return result;
 }catch(error){const status=['JOB_CANCELLED','APPROVAL_REQUIRED'].includes(error.code)?'cancelled':'failed';await pool.query('UPDATE si_jobs SET status=?,error_message=?,result=?,finished_at=CURRENT_TIMESTAMP WHERE id=?',[status,safeError(error),JSON.stringify(result),batchId]);await log(safeError(error),'error');throw error;}
}
