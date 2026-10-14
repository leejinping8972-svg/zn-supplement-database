import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTikTokRecord,conceptMatches} from '../server/tiktok-import.mjs';
import {productWhere,queryOptions} from '../server/repository.mjs';
import {filterRows} from '../src/preview-api.mjs';
const fixture={platform_product_id:'123',name_original:'Magnesium Sleep Capsules',shop_name:'Test Shop',platform_country:'越南',country_evidence:'页面国家筛选：越南',research_url:'https://echotik.live/product/123',description_text:'Ingredients: Magnesium 200 mg. Supports sleep.'};
test('TikTok identity is stable across URLs and separates national storefronts',()=>{
 const a=prepareTikTokRecord(fixture),b=prepareTikTokRecord({...fixture,research_url:'https://echotik.live/product/123?view=detail'}),c=prepareTikTokRecord({...fixture,platform_country:'美国'});
 assert.equal(a.source_identity,b.source_identity);assert.notEqual(a.source_identity,c.source_identity);
 assert.equal(a.product_url,null);assert.equal(a.url,fixture.research_url);
 assert.throws(()=>prepareTikTokRecord({...fixture,country_evidence:''}));
 assert.throws(()=>prepareTikTokRecord({...fixture,shop_name:''}));
 assert.throws(()=>prepareTikTokRecord({...fixture,product_url:'https://example.com/p'}));
 assert.throws(()=>prepareTikTokRecord({...fixture,research_url:'http://127.0.0.1/'}));
});
test('Concepts require explicit topic evidence and exclude warning contexts and intent expansions',()=>{
 const words=[{id:1,name_zh:'睡眠',name_en:'sleep',aliases:[],enabled:1,keyword_type:'topic'},{id:2,name_zh:'睡眠购买',name_en:'buy sleep',aliases:[],enabled:1,keyword_type:'intent'}];
 assert.equal(conceptMatches(fixture,words)[0].name_zh,'睡眠');
 assert.equal(conceptMatches({name_original:'Capsules',description_text:'Not for sleep.'},words).length,0);
 assert.equal(conceptMatches({name_original:'Magnesium',description_text:''},words).length,0);
});
test('Platform filters and shop searches include TikTok rows without an independent site',()=>{
 const q=queryOptions({platform:'tiktok',country:'越南'}),where=productWhere(q);assert.match(where.sql,/p.source_platform=\?/);assert.deepEqual(where.args,['tiktok','越南']);
 const rows=[{id:1,site_id:null,source_platform:'tiktok',sales_country:'越南',shop_name:'Test Shop'},{id:2,site_id:2,source_platform:'independent',sales_country:'越南'}];
 assert.deepEqual(filterRows('products',rows,{platform:'tiktok',country:'越南',search:'Test Shop'}).map(p=>p.id),[1]);
});


test('TikTok imports reject incomplete result counts before accessing the database',async()=>{
 const {importTikTokRecords}=await import('../server/tiktok-import.mjs');
 await assert.rejects(importTikTokRecords([fixture],{expectedCount:2}),/数量与筛选结果/);
 await assert.rejects(importTikTokRecords([fixture,fixture]),/重复商品/);
});
test('TikTok import rolls back and logs failure if approval is revoked before product writes',async()=>{
 const {pool}=await import('../server/db.mjs');const {importTikTokRecords}=await import('../server/tiktok-import.mjs');
 const originalQuery=pool.query,originalConnection=pool.getConnection;const writes=[];let rolledBack=false;
 pool.query=async(sql,args)=>{if(sql.startsWith('SELECT setting_value'))return [[{setting_value:{approved:true}}]];if(sql.startsWith('SELECT * FROM si_keywords'))return [[]];writes.push({sql,args});return [{affectedRows:1}];};
 pool.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{throw new Error('should not commit');},rollback:async()=>{rolledBack=true;},release(){},query:async(sql)=>{if(sql.startsWith('SELECT setting_value'))return [[{setting_value:{approved:false}}]];throw new Error('unexpected product write');}});
 try{await assert.rejects(importTikTokRecords([fixture]),/尚未通过审核/);assert.equal(rolledBack,true);assert.ok(writes.some(w=>w.sql.startsWith('UPDATE si_jobs')&&w.args[0]==='cancelled'));assert.ok(!writes.some(w=>w.sql.includes('INSERT INTO si_products')));}
 finally{pool.query=originalQuery;pool.getConnection=originalConnection;}
});
