import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {config,appRoot} from './config.mjs';
import {migrateSalesCountry} from './sales-country.mjs';

export async function initialize(){
 const {database,...options}=config.db;
 const c=await mysql.createConnection(options);
 try{
  const [available]=await c.query('SHOW DATABASES');
  if(!available.some(r=>r.Database===database))await c.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.changeUser({database});
  await c.query("SET time_zone = '+00:00'");
  const sql=await fs.readFile(path.join(appRoot,'server/schema.sql'),'utf8');
  for(const statement of sql.split(';').map(v=>v.trim()).filter(Boolean))await c.query(statement);
  await c.execute('INSERT IGNORE INTO si_settings (setting_key,setting_value) VALUES (?,?)',['product_ingestion',JSON.stringify({approved:false,approvedBy:null,approvedAt:null})]);
  const source=JSON.parse(await fs.readFile(path.resolve(appRoot,'data/sites-seed.json'),'utf8'));
  if(source.length!==100)throw new Error('站点来源应包含100条记录');
  await c.beginTransaction();
  for(const r of source){
   const values=[r.id,r.number,r.brand,r.url,new URL(r.url).hostname.replace(/^www\./,''),r.country,r.category,r.intro,r.products,r.address,r.address_type,r.country_note,r.china_status,r.china_ops,r.china_summary,r.china_source,r.china_quote,r.company_source,r.date];
   await c.execute(`INSERT IGNORE INTO si_sites (source_key,display_order,brand,url,domain,country,category,intro,main_products,public_address,address_type,country_note,china_status,china_ops,china_summary,china_source,china_quote,company_source,source_date) VALUES (${values.map(()=>'?').join(',')})`,values);
  }
  await c.commit();
  await migrateSalesCountry(c);
  const [[counts]]=await c.query('SELECT (SELECT COUNT(*) FROM si_sites) sites, (SELECT COUNT(*) FROM si_products) products');
  console.log(JSON.stringify({database,counts,productImport:'requires approval'}));
 }catch(e){try{await c.rollback();}catch{}throw e;}finally{await c.end();}
}
if(process.argv[1]?.endsWith('init-db.mjs'))initialize().catch(e=>{console.error('初始化失败:',e.code||'',e.message.replaceAll(config.db.password||'__none__','[redacted]'));process.exitCode=1;});
