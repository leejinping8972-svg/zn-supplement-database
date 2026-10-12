import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {parseShopifyProduct,parseProductPage,parseSitemap,safeImageUrl,nutritionRows} from '../server/parser.mjs';
import {ruleAnalysis,validateAiAnalysis} from '../server/analysis.mjs';
import {isPublicAddress,validatePublicUrl,canonicalProductUrl} from '../server/network.mjs';
import {pool,requireApproved,assertSiteAllowed,requireSiteApproved} from '../server/db.mjs';
import {beginSiteRun} from '../server/site-runs.mjs';
import {createJob} from '../server/jobs.mjs';
import {queryOptions,siteWhere,productWhere,saveProduct} from '../server/repository.mjs';
import {csvCell,exportData,siteColumns} from '../server/export.mjs';
import {crawlSite} from '../server/crawler.mjs';

const site={id:1,brand:'Fixture',url:'https://fixture.example/',domain:'fixture.example'};
test('Shopify extraction retains original labels and does not infer currency',()=>{
 const p=parseShopifyProduct({id:8,title:'Magnesium Capsules',handle:'magnesium',body_html:'<p>Ingredients: Magnesium 200 mg</p>',variants:[{price:'29.90'}],images:[{src:'https://fixture.example/image.jpg'}]},site);
 assert.equal(p.price,29.9);assert.equal(p.currency,null);assert.equal(p.images.length,1);assert.match(p.description_text,/Magnesium 200 mg/);
 assert.equal(safeImageUrl(null,site.url),null);assert.equal(safeImageUrl('javascript:alert(1)',site.url),null);
});
test('Product JSON-LD graphs, offers, image and ingredient section are extracted',()=>{
 const p=parseProductPage('<html lang="en"><script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'Product',name:'Vitamin D3',description:'Daily nutrition',image:['/d.jpg'],offers:{price:'12.50',priceCurrency:'USD'}}]})+'</script><div id="ingredients">Ingredients: Vitamin D3 25 mcg</div></html>',site.url+'products/d?utm_source=ad');
 assert.equal(p.currency,'USD');assert.equal(p.price,12.5);assert.equal(p.url,site.url+'products/d');assert.match(p.description_text,/25 mcg/);assert.equal(p.source_language,'en');
 assert.equal(parseProductPage('<h1>Category</h1>',site.url),null);
 const maps=parseSitemap('<sitemapindex><sitemap><loc>https://fixture.example/products.xml</loc></sitemap></sitemapindex>');assert.equal(maps.sitemaps.length,1);
});
test('Rules separate label doses from marketing mentions and avoid alias substrings',()=>{
 const a=ruleAnalysis({name_original:'Magnesium Capsules',description_text:'Ingredients: Magnesium 200 mg; Zinc 10 mg'});
 assert.equal(a.ingredients.find(i=>i.canonical_key==='magnesium').amount_text,'200 mg');assert.equal(a.translation_status,'partial');assert.equal(a.analysis_status,'needs_review');
 assert.equal(ruleAnalysis({name_original:'Vitamin D3',description_text:'Ingredients: Vitamin D3 25 mcg'}).ingredients[0].amount_text,'25 mcg');
 const b=ruleAnalysis({name_original:'Daily',description_text:'Supports magnesium balance and contains 200 mg of a proprietary blend.'});assert.equal(b.ingredients[0].amount_text,null);assert.equal(b.ingredients[0].evidence_scope,'description_mention');
 assert.equal(ruleAnalysis({name_original:'Daily',description_text:'An inspiring environment for healthy living.'}).ingredients.length,0);
});
test('AI evidence cannot invent ingredient identity or dose',()=>{
 const source={name_original:'Daily',description_text:'Magnesium 200 mg'};
 const raw={name_zh:'每日营养',dosage_form:null,summary:'待核验',ingredients:[{name_original:'Magnesium',name_zh:'镁',canonical_key:'magnesium',amount_text:'200 mg',evidence_text:'Magnesium 200 mg'}],claims:[],warnings:[]};
 assert.equal(validateAiAnalysis(raw,source).ingredients[0].method,'ai');
 assert.throws(()=>validateAiAnalysis({...raw,ingredients:[{...raw.ingredients[0],amount_text:'500 mg'}]},source),/剂量/);
 assert.throws(()=>validateAiAnalysis({...raw,ingredients:[{...raw.ingredients[0],name_original:'Zinc'}]},source),/名称/);
 assert.throws(()=>validateAiAnalysis({...raw,claims:[{claim_zh:'治愈',evidence_text:'cures disease'}]},source),/宣称/);
});
test('Nutrition tables separate active nutrients from excipients and mineral source names',()=>{
 const html='<h2>Supplement Facts</h2><table><tr><th>Amount Per Serving</th><th>Daily Value</th></tr><tr><td>Pantothenic Acid (from calcium pantothenate)</td><td>5 mg</td><td>100%</td></tr><tr><td>Vitamin C (as ascorbic acid)</td><td>90 mg</td><td>100%</td></tr><tr><td>Ashwagandha (root extract)</td><td>125 mg</td><td>†</td></tr></table><p>Other Ingredients: magnesium stearate</p>';
 assert.equal(nutritionRows(html).length,3);
 const a=ruleAnalysis({name_original:'Ashwagandha, 60 Veggie Caps',description_text:'Supplement Facts Pantothenic Acid (from calcium pantothenate) 5 mg Vitamin C 90 mg Ashwagandha 125 mg Other Ingredients: magnesium stearate',raw_data:{body_html:html}});
 assert.equal(a.ingredients.find(i=>i.canonical_key==='vitamin_c').amount_text,'90 mg');assert.equal(a.ingredients.some(i=>i.canonical_key==='calcium'),false);assert.equal(a.ingredients.some(i=>i.canonical_key==='magnesium'),false);
 assert.equal(a.ingredients.find(i=>i.canonical_key==='ashwagandha').amount_text,'125 mg');assert.match(a.name_zh,/南非醉茄/);assert.equal(a.dosage_form,'胶囊');
 assert.equal(ruleAnalysis({name_original:'Daily',description_text:'Supplement Facts Ashwagandha (root extract) 125 mg Other Ingredients: Magnesium stearate.'}).ingredients.some(i=>i.canonical_key==='magnesium'),false);
 assert.equal(ruleAnalysis({name_original:'Daily',description_text:'Ingredients: Vitamin D3 (as cholecalciferol) 25 mcg'}).ingredients[0].amount_text,'25 mcg');
 assert.equal(ruleAnalysis({name_original:'Magnesium',description_text:'Supplement FactsServing Size 2 Veggie CapsulesServings Per Container 120 Magnesium 105 mg'}).serving_size,'2 Veggie Capsules');
});
test('SSRF validation blocks private addresses, obfuscated hosts and foreign domains',()=>{
 for(const address of ['127.0.0.1','10.1.2.3','192.168.2.1','169.254.169.254','::1','fd00::1','::ffff:127.0.0.1'])assert.equal(isPublicAddress(address),false,address);
 for(const url of ['http://127.1/','http://2130706433/','http://[::1]/','http://localhost/','file:///tmp/a','https://fixture.example.evil.example/'])assert.throws(()=>validatePublicUrl(url,site.domain),undefined,url);
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(validatePublicUrl('https://www.fixture.example/products/a',site.domain).hostname,'www.fixture.example');
 assert.equal(canonicalProductUrl(site.url+'products/a?variant=1&utm_source=a&size=2#top'),site.url+'products/a?size=2');
});
test('Approval gate rejects product ingestion and requests a row lock inside transactions',async()=>{
 let sql;const fake={query:async q=>{sql=q;return [[{setting_value:{approved:false}}]];}};
 await assert.rejects(requireApproved(fake,true),e=>e.status===423&&e.code==='APPROVAL_REQUIRED');assert.match(sql,/FOR UPDATE/);
 assert.equal((await requireApproved({query:async()=>[[{setting_value:{approved:true}}]]})).approved,true);
});
test('Product write transaction rolls back before inserts if approval is revoked or job cancelled',async()=>{
 const original=pool.getConnection;
 try{
  for(const approved of [false,true]){
   const queries=[];let rollback=false,commit=false,released=false;
   pool.getConnection=async()=>({beginTransaction:async()=>{},query:async sql=>{queries.push(sql);return [[sql.includes('si_settings')?{setting_value:{approved}}:{cancel_requested:true}]];},commit:async()=>{commit=true;},rollback:async()=>{rollback=true;},release:()=>{released=true;}});
   await assert.rejects(saveProduct(site,{url:site.url+'products/a'},{},'test-job'),e=>e.code===(approved?'JOB_CANCELLED':'APPROVAL_REQUIRED'));
   assert.equal(rollback,true);assert.equal(commit,false);assert.equal(released,true);assert.equal(queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)),false);
  }
 }finally{pool.getConnection=original;}
});
test('Site-specific approval permits only the authorized site and preserves global approvals',async()=>{
 assert.doesNotThrow(()=>assertSiteAllowed({approved:true,allowedSiteIds:[1]},[1]));
 assert.throws(()=>assertSiteAllowed({approved:true,allowedSiteIds:[1]},[1,2]),e=>e.code==='SITE_NOT_APPROVED');
 assert.doesNotThrow(()=>assertSiteAllowed({approved:true},[1,2]));
 await assert.rejects(requireSiteApproved(2,{query:async()=>[[{setting_value:{approved:true,allowedSiteIds:[1]}}]]}),e=>e.code==='SITE_NOT_APPROVED');
});
test('Starting a site run increments its sequence once per job under a site lock',async()=>{
 const calls=[];const fake=existing=>async fn=>fn({query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('si_settings'))return [[{setting_value:{approved:true,allowedSiteIds:[1]}}]];
  if(sql.startsWith('SELECT id,run_number'))return [existing?[{id:7,run_number:2}]:[]];
  if(sql.includes('COALESCE'))return [[{next:3}]];
  if(sql.startsWith('INSERT'))return [{insertId:8}];
  return [[]];
 }});
 assert.deepEqual(await beginSiteRun(1,'job-a','crawl',fake(false)),{id:8,run_number:3});
 assert.ok(calls.some(c=>c.sql==='SELECT id FROM si_sites WHERE id=? FOR UPDATE'));
 calls.length=0;assert.deepEqual(await beginSiteRun(1,'job-a','crawl',fake(true)),{id:7,run_number:2});
 assert.equal(calls.some(c=>c.sql.startsWith('INSERT')),false);
});
test('A dedicated analysis runner reserves its job atomically and preserves site authorization',async()=>{
 const original=pool.getConnection,calls=[];
 try{
  pool.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes('si_settings'))return [[{setting_value:{approved:true,allowedSiteIds:[1]}}]];
   if(sql.startsWith('SELECT id'))return [[{id:3,site_id:1}]];
   if(sql.includes('COUNT(*) active'))return [[{active:0}]];
   return [{}];
  }});
  const result=await createJob('analyze',{productIds:[3],useAi:false},{claimImmediately:true});assert.match(result.id,/^[a-f0-9-]{36}$/);
  const insert=calls.find(c=>c.sql.startsWith('INSERT INTO si_jobs'));assert.equal(insert.args[4],'running');assert.equal(insert.args[5],'running');assert.match(insert.sql,/started_at/);
 }finally{pool.getConnection=original;}
});
test('Search remains parameterized and pagination/selection is bounded',()=>{
 const q=queryOptions({search:"' OR 1=1 --",limit:100000,ids:'1,2,bad,0,-1',sort:'DROP TABLE'}),w=siteWhere(q);
 assert.equal(q.limit,100);assert.deepEqual(q.ids,[1,2]);assert.equal(w.sql.includes('OR 1=1'),false);assert.ok(w.args.includes("%' OR 1=1 --%"));
 assert.match(productWhere(queryOptions({ingredient:'magnesium'})).sql,/EXISTS/);
});
test('Excel exports retain Chinese data; CSV escapes formula injection',async()=>{
 assert.equal(csvCell('=1+2'),'"\'=1+2"');assert.equal(csvCell('a"b'),'"a""b"');
 const out=await exportData([{id:1,brand:'测试',url:'https://fixture.example/'}],siteColumns,'xlsx');const wb=new ExcelJS.Workbook();await wb.xlsx.load(out.body);assert.equal(wb.worksheets[0].getCell('B2').value,'测试');assert.equal(wb.worksheets[0].rowCount,2);
});
test('Crawler respects robots, skips merchandise and never exceeds product cap',async()=>{
 const calls=[],products=[];
 const request=async url=>{calls.push(url);return url.includes('products.json')?{status:200,text:JSON.stringify({products:[{title:'T-shirt',handle:'shirt'},{title:'Magnesium',handle:'magnesium',body_html:'Ingredients: Magnesium 200 mg'},{title:'Zinc',handle:'zinc'}]})}:{status:404,text:''};};
 const rulesProvider=async()=>({isAllowed:url=>!url.endsWith('/products/magnesium'),getCrawlDelay:()=>0,getSitemaps:()=>[]});
 const result=await crawlSite(site,{limit:1,request,rulesProvider,wait:async()=>{},onProduct:async p=>products.push(p)});
 assert.equal(result.found,1);assert.equal(products[0].name_original,'Magnesium');assert.equal(calls.length,1);assert.equal(result.capped,true);
});
test('Crawler stops before network or insert when approval/cancel check rejects',async()=>{
 let fetched=0,inserted=0;const fail=Object.assign(new Error('locked'),{code:'APPROVAL_REQUIRED'});
 await assert.rejects(crawlSite(site,{request:async()=>{fetched++;},rulesProvider:async()=>({isAllowed:()=>true,getCrawlDelay:()=>0}),check:async()=>{throw fail;},onProduct:async()=>{inserted++;}}),/locked/);
 assert.equal(fetched,0);assert.equal(inserted,0);
});
