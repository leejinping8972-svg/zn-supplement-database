import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSiteOptions} from '../src/site-options.mjs';
test('Site selectors include sites beyond the first 100 in both API modes',async()=>{
 const sites=Array.from({length:205},(_,i)=>({id:i+1,brand:'Site '+(i+1)})),pages=[];
 const result=await loadSiteOptions(async url=>{const page=Number(new URL(url,'https://example.com').searchParams.get('page'));pages.push(page);return {rows:sites.slice((page-1)*100,page*100),total:sites.length};});
 assert.equal(result.rows.length,205);assert.equal(result.rows.at(-1).id,205);assert.deepEqual(pages,[1,2,3]);
});
test('Site selectors fail visibly instead of silently truncating missing pages',async()=>{
 await assert.rejects(loadSiteOptions(async()=>({rows:[],total:105})),/未完整加载/);
 const controller=new AbortController();controller.abort();let requests=0;
 await assert.rejects(loadSiteOptions(async()=>{requests++;},{signal:controller.signal}),{name:'AbortError'});assert.equal(requests,0);
});
