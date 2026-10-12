import {pool,transaction,jsonValue,requireSiteApproved} from './db.mjs';
import {queryOptions} from './repository.mjs';

export async function beginSiteRun(siteId,jobId,type,connectionFactory=transaction){
 return connectionFactory(async c=>{
  await requireSiteApproved(siteId,c,true);
  await c.query('SELECT id FROM si_sites WHERE id=? FOR UPDATE',[siteId]);
  const [[existing]]=await c.query('SELECT id,run_number FROM si_site_analysis_runs WHERE site_id=? AND job_id=?',[siteId,jobId]);
  if(existing)return existing;
  const [[{next}]]=await c.query('SELECT COALESCE(MAX(run_number),0)+1 next FROM si_site_analysis_runs WHERE site_id=?',[siteId]);
  const [r]=await c.query('INSERT INTO si_site_analysis_runs (site_id,job_id,run_number,run_type) VALUES (?,?,?,?)',[siteId,jobId,next,type]);
  return {id:r.insertId,run_number:next};
 });
}
export async function updateRunProgress(id,count){await pool.query("UPDATE si_site_analysis_runs SET products_processed=? WHERE id=? AND status='running'",[count,id]);}
export async function finishSiteRun(id,status,{products=0,result=null,error=null}={}){
 await pool.query("UPDATE si_site_analysis_runs SET status=?,products_processed=?,result=?,error_message=?,finished_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'",[status,products,result?JSON.stringify(result):null,error,id]);
}
export async function listSiteRuns(input={},all=false){
 const q=queryOptions(input),clauses=[],args=[];
 if(q.search){clauses.push('(s.brand LIKE ? OR s.domain LIKE ?)');args.push('%'+q.search+'%','%'+q.search+'%');}
 if(/^\d+$/.test(String(q.site))){clauses.push('r.site_id=?');args.push(Number(q.site));}
 if(['running','completed','no_products','failed','cancelled','interrupted'].includes(q.status)){clauses.push('r.status=?');args.push(q.status);}
 for(const [key,operator] of [['from','>='],['to','<=']])if(input[key]){
  const date=String(input[key]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  clauses.push(`DATE(CONVERT_TZ(r.started_at,'+00:00','+08:00')) ${operator} ?`);args.push(date);
 }
 const from=' FROM si_site_analysis_runs r JOIN si_sites s ON s.id=r.site_id',where=clauses.length?' WHERE '+clauses.join(' AND '):'';
 const [[{total}]]=await pool.query('SELECT COUNT(*) total'+from+where,args);
 const [rows]=await pool.query('SELECT r.*,s.brand,s.domain,(SELECT COUNT(*) FROM si_site_analysis_runs a WHERE a.site_id=s.id) analysis_count'+from+where+' ORDER BY r.started_at DESC,r.id DESC'+(all?' LIMIT 10000':' LIMIT ? OFFSET ?'),all?args:[...args,q.limit,(q.page-1)*q.limit]);
 return {rows:rows.map(r=>({...r,result:jsonValue(r.result)})),total,page:q.page,limit:q.limit};
}
