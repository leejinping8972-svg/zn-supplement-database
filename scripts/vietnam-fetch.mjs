import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validatePublicUrl,USER_AGENT,requestPublic} from '../server/network.mjs';
const exec=promisify(execFile);
// Optional existing local proxy; never store credentials or disable TLS verification.
export async function researchRequest(value,options={}){
 if(!process.env.RESEARCH_PROXY)return requestPublic(value,options);
 const {allowedDomain,maxBytes=3000000,timeout=25000,redirects=0}=options;
 const u=validatePublicUrl(value,allowedDomain);if(redirects>5)throw new Error('Too many redirects');
 const {stdout}=await exec('curl.exe',['--silent','--show-error','--proxy',process.env.RESEARCH_PROXY,'--max-time',String(Math.ceil(timeout/1000)),'--max-filesize',String(maxBytes),'--user-agent',USER_AGENT,'--dump-header','-','--url',u.href],{encoding:'utf8',maxBuffer:maxBytes+200000,windowsHide:true});
 let remaining=stdout,header='';while(remaining.startsWith('HTTP/')){const end=remaining.indexOf('\r\n\r\n');if(end<0)break;header=remaining.slice(0,end);remaining=remaining.slice(end+4);}
 const status=Number(header.match(/^HTTP\/\S+\s+(\d+)/)?.[1]);if(!status)throw new Error('Invalid HTTP response');
 const location=header.match(/^location:\s*(.+)$/im)?.[1]?.trim();
 if([301,302,303,307,308].includes(status)&&location)return researchRequest(new URL(location,u).href,{...options,redirects:redirects+1});
 return {status,text:remaining,url:u.href,headers:{},body:Buffer.from(remaining)};
}
