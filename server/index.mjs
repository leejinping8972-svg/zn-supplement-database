import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import {z} from 'zod';
import {config,appRoot,publicConfig} from './config.mjs';
import {pool,approval,transaction,AppError,requireSiteApproved} from './db.mjs';
import {listSiteRuns} from './site-runs.mjs';
import {dashboard,listSites,listProducts,siteDetail,productDetail} from './repository.mjs';
import {exportData,siteColumns,productColumns,runColumns,keywordColumns} from './export.mjs';
import {createJob,listJobs,startWorker,stopWorker,safeError} from './jobs.mjs';
import {listKeywords,saveKeyword,deleteKeyword,seedKeywords} from './keywords.mjs';
import {requestPublic} from './network.mjs';
import {searchSettings,saveSearchKey} from './search-provider.mjs';
import {createDiscoveryJob,discoveryOverview,recoverDiscoveryJobs,startDiscoveryWorker,stopDiscoveryWorker} from './site-discovery.mjs';

const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{if(![`127.0.0.1:${config.port}`,`localhost:${config.port}`].includes(req.headers.host))return res.status(403).send('请求主机未授权');next();});
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'https:','http:','data:'],connectSrc:["'self'"],upgradeInsecureRequests:null}},crossOriginResourcePolicy:{policy:'same-origin'}}));
app.use(express.json({limit:'128kb'}));
app.use('/api',(req,res,next)=>{
 if(!['GET','HEAD'].includes(req.method)){
  const allowed=new Set([`http://127.0.0.1:${config.port}`,`http://localhost:${config.port}`]);
  if(req.headers['x-app-request']!=='NutraScope'||(req.headers.origin&&!allowed.has(req.headers.origin)))return next(new AppError(403,'请求来源未授权','INVALID_ORIGIN'));
 }
 res.setHeader('Cache-Control','no-store');next();
});
const idSchema=z.coerce.number().int().positive();
app.get('/api/discovery',async(req,res)=>res.json(await discoveryOverview(req.query)));
app.get('/api/search-settings',(_,res)=>res.json(searchSettings()));
app.put('/api/search-settings',async(req,res)=>{
 const {apiKey}=z.object({apiKey:z.string().trim().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/)}).strict().parse(req.body);
 const state=await saveSearchKey(apiKey);
 await pool.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['search_provider_configured','local_user',JSON.stringify({provider:'serpapi',configured:true})]);
 await pool.query('UPDATE si_jobs SET status="queued",error_message=NULL WHERE job_type="discover" AND status="waiting_for_config" AND cancel_requested=0');res.json(state);
});
app.post('/api/discovery/jobs',async(req,res)=>{const data=z.object({market:z.enum(['us','gb','ca','de','fr']).default('us'),language:z.enum(['en','zh']).default('en'),keywordIds:z.array(z.number().int().positive()).min(1).max(2000).optional()}).strict().parse(req.body);res.status(201).json(await createDiscoveryJob(data));});
const keywordSchema=z.object({name_zh:z.string().trim().min(1).max(190),name_en:z.string().trim().min(1).max(190),category:z.string().trim().min(1).max(100),aliases:z.array(z.string().trim().min(1).max(190)).max(30).default([]),enabled:z.boolean().default(true),keyword_type:z.enum(['topic','intent']).default('topic')}).strict();
app.get('/api/keywords',async(req,res)=>res.json(await listKeywords(req.query)));
app.post('/api/keywords',async(req,res)=>res.status(201).json(await saveKeyword(null,keywordSchema.parse(req.body))));
app.patch('/api/keywords/:id',async(req,res)=>res.json(await saveKeyword(idSchema.parse(req.params.id),keywordSchema.parse(req.body))));
app.delete('/api/keywords/:id',async(req,res)=>res.json(await deleteKeyword(idSchema.parse(req.params.id))));
app.post('/api/keywords/seed',async(req,res)=>res.json({count:await seedKeywords()}));
app.post('/api/keywords/rematch',async(req,res)=>{const [rows]=await pool.query('SELECT id FROM si_products ORDER BY id');if(!rows.length)throw new AppError(400,'暂无商品可匹配');res.status(201).json(await createJob('match',{productIds:rows.map(p=>p.id)}));});
app.get('/api/health',async(req,res)=>{await pool.query('SELECT 1');res.json({ok:true});});
app.get('/api/overview',async(req,res)=>res.json({...await dashboard(),approval:await approval(),config:publicConfig()}));
app.get('/api/sites',async(req,res)=>res.json(await listSites(req.query)));
app.get('/api/sites/:id',async(req,res)=>res.json(await siteDetail(idSchema.parse(req.params.id))));
app.get('/api/sites/:id/analysis-runs',async(req,res)=>res.json(await listSiteRuns({...req.query,site:idSchema.parse(req.params.id)})));
app.get('/api/analysis-runs',async(req,res)=>res.json(await listSiteRuns(req.query)));
app.patch('/api/sites/:id',async(req,res)=>{
 const id=idSchema.parse(req.params.id),data=z.object({watched:z.boolean().optional(),notes:z.string().max(5000).optional()}).strict().parse(req.body);await siteDetail(id);
 const keys=Object.keys(data);if(!keys.length)throw new AppError(400,'请提供修改内容');
 await transaction(async c=>{await c.query('UPDATE si_sites SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?',[...keys.map(k=>data[k]),id]);await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['site_updated','local_user',JSON.stringify({id,...data})]);});res.json(await siteDetail(id));
});
const icons=new Map();
app.get('/api/sites/:id/icon',async(req,res)=>{
 const id=idSchema.parse(req.params.id);res.setHeader('Cache-Control','public,max-age=3600');
 if(!icons.has(id)||icons.get(id).expires<Date.now()){
  try{const site=await siteDetail(id);const r=await requestPublic(new URL('/favicon.ico',site.url).href,{allowedDomain:site.domain,maxBytes:300000,timeout:6000});const mime=r.headers['content-type']||'';icons.set(id,{expires:Date.now()+3600000,data:r.status===200&&/^image\/(?!svg)/i.test(mime)?r.body:null,mime});}catch{icons.set(id,{expires:Date.now()+3600000,data:null});}
 }
 const icon=icons.get(id);if(!icon.data)return res.status(204).end();res.type(icon.mime).send(icon.data);
});
app.get('/api/products',async(req,res)=>res.json(await listProducts(req.query)));
app.get('/api/products/:id',async(req,res)=>res.json(await productDetail(idSchema.parse(req.params.id))));
app.patch('/api/products/:id',async(req,res)=>{
 const id=idSchema.parse(req.params.id),data=z.object({name_zh:z.string().min(1).max(512),reviewed:z.boolean()}).strict().parse(req.body);
 await transaction(async c=>{const [[p]]=await c.query('SELECT id,site_id FROM si_products WHERE id=?',[id]);if(!p)throw new AppError(404,'商品不存在');await requireSiteApproved(p.site_id,c,true);await c.query('UPDATE si_products SET name_zh=?,translation_status=?,analysis_status=? WHERE id=?',[data.name_zh,'manual',data.reviewed?'reviewed':'needs_review',id]);await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['product_reviewed','local_user',JSON.stringify({id,...data})]);});res.json(await productDetail(id));
});
app.get('/api/export/:kind',async(req,res)=>{
 if(!['sites','products','analysis-runs','keywords'].includes(req.params.kind))throw new AppError(404,'导出类型不存在');
 const format=z.enum(['xlsx','csv','json']).parse(req.query.format||'xlsx');let rows;
 if(req.params.kind==='keywords')rows=(await listKeywords(req.query,true)).rows.map(k=>({...k,aliases:k.aliases.join('；')}));
 else if(req.params.kind==='analysis-runs')rows=(await listSiteRuns(req.query,true)).rows;
 else if(req.params.kind==='sites')rows=(await listSites(req.query,true)).rows;
 else{
  rows=(await listProducts(req.query,true)).rows;
  if(rows.length){const ids=rows.map(r=>r.id),marks=ids.map(()=>'?').join(',');const [ingredients]=await pool.query('SELECT * FROM si_product_ingredients WHERE product_id IN ('+marks+')',ids);const [images]=await pool.query('SELECT * FROM si_product_images WHERE product_id IN ('+marks+') ORDER BY sort_order',ids);rows=rows.map(r=>({...r,keyword_names:r.keywords.filter(k=>k.evidence_scope!=='warning_or_negation').map(k=>k.name_zh).join('；'),ingredient_names:ingredients.filter(i=>i.product_id===r.id).map(i=>i.name_zh).join('；'),ingredient_evidence:ingredients.filter(i=>i.product_id===r.id).map(i=>i.name_zh+'：'+(i.amount_text||'剂量未公开')+' | '+i.evidence_scope+' | '+i.evidence_text).join('\n'),image_urls:images.filter(i=>i.product_id===r.id).map(i=>i.image_url).join('\n')}));}
 }
 const result=await exportData(rows,req.params.kind==='keywords'?keywordColumns:req.params.kind==='sites'?siteColumns:req.params.kind==='products'?productColumns:runColumns,format);
 res.type(result.mime).setHeader('Content-Disposition',`attachment; filename="zn-supplements-${req.params.kind}-${new Date().toISOString().slice(0,10)}.${format}"`);res.send(result.body);
});
app.get('/api/jobs',async(req,res)=>res.json(await listJobs()));
app.get('/api/jobs/:id/events',async(req,res)=>{const id=z.string().uuid().parse(req.params.id);const [rows]=await pool.query('SELECT * FROM si_job_events WHERE job_id=? ORDER BY id DESC LIMIT 300',[id]);res.json(rows);});
app.post('/api/jobs',async(req,res)=>{
 const data=z.discriminatedUnion('type',[
  z.object({type:z.literal('crawl'),siteIds:z.array(z.number().int().positive()).min(1).max(100),limitPerSite:z.number().int().min(1).max(1000),useAi:z.boolean().default(true)}),
  z.object({type:z.literal('analyze'),productIds:z.array(z.number().int().positive()).min(1).max(1000),useAi:z.boolean().default(true)})
 ]).parse(req.body);const {type,...options}=data;res.status(201).json(await createJob(type,options));
});
app.post('/api/jobs/:id/cancel',async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id);const [result]=await pool.query("UPDATE si_jobs SET cancel_requested=1,finished_at=IF(status IN ('queued','waiting_for_config'),CURRENT_TIMESTAMP,finished_at),status=IF(status IN ('queued','waiting_for_config'),'cancelled',status) WHERE id=? AND status IN ('queued','running','waiting_for_config')",[id]);if(!result.affectedRows)throw new AppError(409,'任务已结束或不存在');res.json({ok:true});
});
app.post('/api/approval',async(req,res)=>{
 const data=z.object({approved:z.boolean(),actor:z.string().trim().min(1).max(190),confirmation:z.string().optional(),checks:z.array(z.string()).optional(),allowedSiteIds:z.array(z.number().int().positive()).min(1).max(100).optional()}).strict().parse(req.body);
 if(data.approved&&(data.confirmation!=='确认开放商品采集'||!['data','analysis','scope'].every(k=>data.checks?.includes(k))))throw new AppError(400,'请完成审核清单和确认文字');
 const state={approved:data.approved,approvedBy:data.actor,approvedAt:new Date().toISOString(),...(data.allowedSiteIds?{allowedSiteIds:[...new Set(data.allowedSiteIds)]}:{})};
 await transaction(async c=>{await approval(c,true);await c.query("UPDATE si_settings SET setting_value=? WHERE setting_key='product_ingestion'",[JSON.stringify(state)]);if(!data.approved)await c.query("UPDATE si_jobs SET cancel_requested=1,status=IF(status IN ('queued','waiting_for_config'),'cancelled',status) WHERE status IN ('queued','running','waiting_for_config')");await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',[data.approved?'ingestion_approved':'ingestion_paused',data.actor,JSON.stringify(state)]);});res.json(state);
});
app.get('/api/audit',async(req,res)=>{const [rows]=await pool.query('SELECT id,action,actor,created_at FROM si_audit_log ORDER BY id DESC LIMIT 50');res.json(rows);});
app.use('/api',(req,res)=>res.status(404).json({error:'接口不存在',code:'NOT_FOUND'}));
const dist=path.join(appRoot,'dist');
if(fs.existsSync(dist)){app.use(express.static(dist));app.get(/.*/,(_,res)=>res.sendFile(path.join(dist,'index.html')));}
else app.get('/',(_,res)=>res.status(503).send('请先运行 npm run build 构建界面。'));
app.use((error,req,res,next)=>{
 const validation=error instanceof z.ZodError;const status=validation?400:error.status||500;
 if(status>=500)console.error('请求失败:',error.code||'ERROR');
 res.status(status).json({error:validation?'参数格式不正确':status>=500?'数据库或服务暂时不可用，请稍后重试':safeError(error),code:validation?'VALIDATION_ERROR':error.code||'REQUEST_FAILED'});
});
await pool.query('SELECT 1');await recoverDiscoveryJobs();await startWorker();startDiscoveryWorker();
const server=app.listen(config.port,config.host,()=>console.log(`ZN保健品数据库 http://${config.host}:${config.port} | database=${config.db.database}`));
server.on('error',e=>{console.error('服务启动失败:',e.code);process.exitCode=1;pool.end();});
async function shutdown(){server.close();stopDiscoveryWorker();await stopWorker();await pool.end();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
