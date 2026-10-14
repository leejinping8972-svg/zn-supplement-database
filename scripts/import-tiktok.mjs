import fs from 'node:fs/promises';
import {pool} from '../server/db.mjs';
import {migrateProductSource} from '../server/product-source.mjs';
import {safeError} from '../server/jobs.mjs';
import {importTikTokRecords} from '../server/tiktok-import.mjs';
try{
 if(!process.argv[2])throw new Error('请提供经页面核对的 JSON 文件路径');
 const c=await pool.getConnection();try{await migrateProductSource(c);}finally{c.release();}
 const batch=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
 console.log(JSON.stringify(await importTikTokRecords(batch.products,{sourcePage:batch.sourcePage,expectedCount:batch.expectedCount})));
}catch(e){console.error(e.name==='ZodError'?'采集数据字段不完整，请核对店铺、国家证据和来源链接。':safeError(e));process.exitCode=1;}finally{await pool.end();}
