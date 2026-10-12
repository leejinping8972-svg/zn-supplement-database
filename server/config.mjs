import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
dotenv.config({path:path.join(appRoot,'.env'),quiet:true});
export const config={
  host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3210),
  db:{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'supplement_research',charset:'utf8mb4',timezone:'Z',connectTimeout:12000},
  ai:{baseUrl:process.env.AI_BASE_URL||'https://api.openai.com/v1',key:process.env.AI_API_KEY||'',model:process.env.AI_MODEL||'',vision:process.env.AI_VISION_ENABLED==='true'},
};
if(!/^[a-zA-Z0-9_]+$/.test(config.db.database))throw new Error('数据库名称只能包含字母、数字和下划线');
if(process.env.DB_SSL!=='false'){
  config.db.ssl={rejectUnauthorized:true};
  if(process.env.DB_SSL_CA_FILE)config.db.ssl.ca=fs.readFileSync(path.resolve(appRoot,process.env.DB_SSL_CA_FILE));
}
export function publicConfig(){return {database:config.db.database,tls:Boolean(config.db.ssl),aiConfigured:Boolean(config.ai.key&&config.ai.model),aiModel:config.ai.model||null,aiVision:config.ai.vision,productImportRequiresApproval:true};}
