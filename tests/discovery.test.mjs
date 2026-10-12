import test from 'node:test';
import assert from 'node:assert/strict';
import {googleParameters,parseSearchResponse,searchGoogle,searchSettings} from '../server/search-provider.mjs';
import {discoveryDomain,excludedDomain,classifyStore,createDiscoveryJob,processDiscovery} from '../server/site-discovery.mjs';
import {pool} from '../server/db.mjs';

test('Google searches exactly pages 1-3 with explicit locale and no rewritten keywords',()=>{
 for(const [page,start] of [[1,'0'],[2,'10'],[3,'20']]){const p=googleParameters('menopause',page,'us');assert.equal(p.start,start);assert.equal(p.q,'menopause');assert.equal(p.engine,'google');assert.equal(p.gl,'us');}
 assert.equal(googleParameters('sleep',1,'gb').google_domain,'google.co.uk');assert.throws(()=>googleParameters('sleep',4,'us'));
});
test('Only organic search results are used and page/global ranks are retained',()=>{
 const body={organic_results:[{title:'One',link:'https://one.example/',position:1},{title:'Two',link:'https://two.example/',position:12}],ads:[{link:'https://ad.example/'}]};
 const rows=parseSearchResponse(body,2);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.rank),[11,12]);assert.deepEqual(parseSearchResponse({search_information:{organic_results_state:'Fully empty'}},1),[]);assert.throws(()=>parseSearchResponse({},1),/异常/);
});
test('Search errors do not expose provider credentials and rate limits pause the task',async()=>{
 const secret='fixture-secret-key';
 await assert.rejects(searchGoogle('sleep',1,'us',{apiKey:secret,fetcher:async()=>{throw new Error('failed '+secret);}}),e=>e.code==='SEARCH_NETWORK_ERROR'&&!e.message.includes(secret));
 await assert.rejects(searchGoogle('sleep',1,'us',{apiKey:secret,fetcher:async()=>({status:429,ok:false})}),e=>e.code==='SEARCH_QUOTA_REQUIRED');
 const r=await searchGoogle('sleep',3,'us',{apiKey:secret,fetcher:async url=>{assert.equal(url.searchParams.get('start'),'20');return {ok:true,status:200,json:async()=>({organic_results:[{link:'https://fixture.example/',position:1}]})};}});assert.equal(r.results[0].rank,21);
});
test('Registrable-domain dedup handles co.uk and rejects public marketplace and internal URLs',()=>{
 assert.equal(discoveryDomain('https://shop.brand.co.uk/products/a'),'brand.co.uk');assert.equal(discoveryDomain('https://www.brand.co.uk/'),'brand.co.uk');assert.ok(excludedDomain('https://www.amazon.co.uk/a'));assert.ok(excludedDomain('https://pubmed.ncbi.nlm.nih.gov/123'));assert.equal(excludedDomain('https://amazon-brand.example.com'),false);assert.throws(()=>discoveryDomain('http://127.0.0.1/a'));
});
test('A health article or unrelated store is not automatically classified as supplement retail',()=>{
 const article='<body><h1>Vitamins and menopause</h1><p>A review of dietary supplements.</p><a href="https://amazon.com/">Buy now</a></body>';
 assert.equal(classifyStore(article,'https://fixture.example/blog/a').decision,'needs_review');
 const apparel='<script type="application/ld+json">{"@type":"Product","name":"Shirt","offers":{"price":"10"}}</script><body>Buy now. T-shirt.</body>';
 assert.equal(classifyStore(apparel,'https://fixture.example/shirt').decision,'needs_review');
 const affiliate='<script type="application/ld+json">{"@type":"Product","offers":{"price":"20"}}</script><body>Dietary supplements.<a href="https://amazon.com/product">Buy now</a></body>';
 assert.equal(classifyStore(affiliate,'https://fixture.example/article').decision,'needs_review');
 const store='<meta property="og:site_name" content="Fixture Nutrition"><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Magnesium Capsules","offers":{"price":"20"}}]}</script><body>Dietary supplements. Magnesium capsules.<button>Add to cart</button></body>';
 const result=classifyStore(store,'https://fixture.example/product');assert.equal(result.decision,'independent');assert.equal(result.brand,'Fixture Nutrition');assert.match(result.evidence.supplementMention,/Dietary supplements/);assert.match(result.evidence.commerce,/JSON-LD/);
});
test('Discovery stores page provenance and decisions for all three pages without live searches',async()=>{
 const originalQuery=pool.query,originalGet=pool.getConnection,records=[],decisions=[],calls=[],stored=new Map();let progress;
 const query=async(sql,args=[])=>{
  calls.push(sql);
  if(sql.includes('si_settings'))return [[{setting_value:{approved:true}}]];
  if(sql.startsWith('SELECT status,cancel_requested'))return [[{status:'running',cancel_requested:0}]];
  if(sql.startsWith('SELECT cancel_requested'))return [[{cancel_requested:0}]];
  if(sql.startsWith('SELECT * FROM si_search_pages'))return [stored.has(args[2])?[stored.get(args[2])]:[]];
  if(sql.startsWith('INSERT INTO si_search_pages')){const id=stored.size+1;stored.set(args[5],{id,status:'completed'});return [{insertId:id}];}
  if(sql.startsWith('INSERT IGNORE INTO si_discovered_pages')){records.push({id:records.length+1,search_page_id:args[0],url:args[1],domain:args[3],decision:'pending'});return [{}];}
  if(sql.startsWith('SELECT * FROM si_discovered_pages'))return [records.filter(r=>r.search_page_id===args[0]&&r.decision==='pending')];
  if(sql.startsWith('UPDATE si_discovered_pages')){const r=records.find(r=>r.id===args[4]);r.decision=args[0];decisions.push(args);return [{}];}
  if(sql.includes('COUNT(*) done'))return [[{done:stored.size,errors:0}]];
  if(sql.includes('COUNT(*) results'))return [[{results:records.length,newSites:1}]];
  if(sql.startsWith('UPDATE si_jobs SET progress'))progress=JSON.parse(args[0]);
  return [{}];
 };
 try{pool.query=query;pool.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query});
  const pages=[];await processDiscovery({id:'fixture',options:{market:'us',language:'en',queries:[{id:1,name:'睡眠',query:'sleep'}]},progress:{}},{wait:async()=>{},search:async(q,page,market)=>{pages.push(page);assert.equal(q,'sleep');assert.equal(market,'us');return {results:[{url:'https://brand.example/product-'+page,title:'Fixture',snippet:'Sleep support',rank:(page-1)*10+1}]};},inspect:async row=>({decision:'independent',reason:'Fixture merchant evidence',site_id:99,evidence:{checkedUrl:row.url}})});
  assert.deepEqual(pages,[1,2,3]);assert.equal(stored.size,3);assert.equal(decisions.length,3);assert.ok(decisions.every(a=>a[3]===99&&JSON.parse(a[2]).checkedUrl));assert.equal(progress.done,3);assert.equal(progress.results,3);
 }finally{pool.query=originalQuery;pool.getConnection=originalGet;}
});
test('Discovery freezes enabled keyword queries, reserves one task, and waits without a credential',async()=>{
 const original=pool.getConnection,calls=[];
 try{pool.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('si_settings'))return [[{setting_value:{approved:true}}]];if(sql.includes('COUNT(*) count'))return [[{count:0}]];if(sql.includes('SELECT id,name_zh'))return [[{id:1,name_zh:'更年期',name_en:'menopause'},{id:2,name_zh:'睡眠',name_en:'sleep'}]];return [{}];}});
 const r=await createDiscoveryJob({market:'us',language:'en'});assert.equal(r.maxSearchRequests,6);assert.equal(r.status,searchSettings().configured?'queued':'waiting_for_config');const insert=calls.find(c=>c.sql.startsWith('INSERT INTO si_jobs'));const options=JSON.parse(insert.args[2]);assert.deepEqual(options.queries.map(q=>q.query),['menopause','sleep']);assert.equal(options.pages,3);
 }finally{pool.getConnection=original;}
});
test('Cancelled discovery stops before search requests or site writes',async()=>{
 const original=pool.query,calls=[];
 try{pool.query=async(sql,args)=>{calls.push(sql);if(sql.includes('si_settings'))return [[{setting_value:{approved:true}}]];if(sql.startsWith('SELECT status,cancel_requested'))return [[{status:'running',cancel_requested:1}]];if(sql.includes('COUNT(*) done'))return [[{done:0,errors:0}]];if(sql.includes('COUNT(*) results'))return [[{results:0,newSites:0}]];return [{}];};await processDiscovery({id:'fixture',options:{market:'us',language:'en',queries:[{id:1,name:'睡眠',query:'sleep'}]},progress:{}});assert.equal(calls.some(s=>s.startsWith('INSERT INTO si_search_pages')),false);assert.equal(calls.some(s=>s.startsWith('INSERT INTO si_sites')),false);assert.ok(calls.some(s=>s.startsWith('UPDATE si_jobs SET status=')));
 }finally{pool.query=original;}
});
