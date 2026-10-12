import {pool,requireSiteApproved} from './db.mjs';
import {createJob,processClaimedJob,safeError} from './jobs.mjs';

const siteId=Number(process.argv[2]);
try{
 if(!Number.isSafeInteger(siteId)||siteId<1)throw new Error('请提供有效站点编号');
 await requireSiteApproved(siteId);
 const [products]=await pool.query('SELECT id FROM si_products WHERE site_id=? ORDER BY id',[siteId]);
 if(!products.length||products.length>1000)throw new Error('单次复核需要1至1000件已入库商品');
 const [[{active}]]=await pool.query("SELECT COUNT(*) active FROM si_jobs WHERE status='running'");
 if(active)throw new Error('请等待现有任务结束后再复核');
 // Reserve the job as running so the server's queue cannot claim it again.
 const {id}=await createJob('analyze',{productIds:products.map(p=>p.id),useAi:false},{claimImmediately:true});
 const [[job]]=await pool.query('SELECT * FROM si_jobs WHERE id=?',[id]);
 console.log(JSON.stringify({id,siteId,products:products.length,status:'running'}));
 await processClaimedJob(job);
 const [[result]]=await pool.query('SELECT id,status,progress,error_message FROM si_jobs WHERE id=?',[id]);
 console.log(JSON.stringify(result));
 if(result.status!=='completed')process.exitCode=1;
}catch(e){console.error(safeError(e));process.exitCode=1;}finally{await pool.end();}
