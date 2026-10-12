import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let env={};try{env=dotenv.parse(await fs.readFile(path.join(root,'.env')));}catch{}
const secrets=Object.entries(env).filter(([k,v])=>v.length>=8&&(/PASSWORD|API_KEY|TOKEN|SECRET|DB_HOST/.test(k))).map(([,v])=>v);
try{const key=JSON.parse(await fs.readFile(path.join(root,'.search-config.json'),'utf8')).apiKey;if(key)secrets.push(key);}catch{}
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),issues=[];
for(const file of files){
 if(/(^|\/)(\.env(?!\.example$)|\.search-config\.json|logs|node_modules|test-artifacts|release)(\/|$)/.test(file))issues.push({file,reason:'private or generated file'});
 const body=await fs.readFile(path.join(root,file));if(body.length>25*1024*1024)issues.push({file,reason:'too large for browser upload'});
 if(secrets.some(s=>body.includes(Buffer.from(s))))issues.push({file,reason:'local credential or database host'});
 if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|sk-proj-[A-Za-z0-9_-]{30,})/.test(body.toString('utf8')))issues.push({file,reason:'possible credential'});
}
if(issues.length){console.error(JSON.stringify({passed:false,issues}));process.exitCode=1;}else console.log(JSON.stringify({passed:true,files:files.length,localSecretsExcluded:true}));
