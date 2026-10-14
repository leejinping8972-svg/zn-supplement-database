import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuantity,listingMetrics,marketSummary,scopeKeywords} from '../shared/market.mjs';
import {filterRows} from '../src/preview-api.mjs';
import {queryOptions,productWhere} from '../server/repository.mjs';
test('Sales parsing distinguishes missing values, units, money and shop totals',()=>{
 for(const [raw,n] of [['1.26万',12600],['8,231',8231],['1.5亿',150000000],['2.4K',2400],['0',0],['--',null],['$98',null],['1,2',null],['',null]])assert.equal(parseQuantity(raw),n);
 const base={source:'echotik_observed_page',country_evidence:'2026-10-14 EchoTik'};
 assert.equal(listingMetrics({...base,listing_text:'title\t店铺 总销量: 99万\t7175\t$30.9万\t\t8.23万\t$304.25万\t995\t2438\t'}).sales_7d,7175);
 assert.equal(listingMetrics({...base,listing_text:'店铺总销量：98.4万\n近7天销量：1.26万\n近7天GMV：$9.53万\n总销量：22.52万'}).sales_7d,12600);
 assert.equal(listingMetrics({...base,listing_text:'总销量：1000'}),null);
 assert.equal(listingMetrics({listing_text:'近7天销量：1000'}),null);
});
const keywords=[{id:1,name_zh:'睡眠',enabled:true,keyword_type:'topic',aliases:[]},{id:2,name_zh:'睡眠购买',enabled:true,keyword_type:'intent',aliases:[]},{id:3,name_zh:'停用词',enabled:false,keyword_type:'topic',aliases:[]}];
const product=(id,country,sales,date='2026-10-14')=>({id,sales_country:country,source_platform:'tiktok',supplement_category:true,metrics:sales===null?null:{sales_7d:sales,observed_on:date},keywords:[{id:1},{id:1},{id:2},{id:3}],ingredients:[{key:'mg',name:'镁',with_dose:true},{key:'mg',name:'镁',label_evidence:true}]});
const data={keywords,products:[product(1,'越南',100),product(2,'美国',200),product(3,'越南',null),product(4,'越南',90,'2026-10-13'),{...product(5,'越南',0),keywords:[{id:1,evidence_scope:'warning_or_negation'}]},product(6,null,5)]};
test('Country rankings deduplicate products, exclude warnings and intents, separate missing from zero, and never mix dates',()=>{
 const r=marketSummary(data,{country:'越南'});assert.equal(r.total,4);assert.equal(r.measured,2);assert.deepEqual(r.products.map(p=>p.id),[1,5]);
 assert.deepEqual(r.topics.map(t=>[t.key,t.products,t.measured,t.sales]),[[1,3,1,100]]);
 assert.equal(r.ingredients[0].products,4);assert.equal(r.ingredients[0].sales,100);assert.equal(r.ingredients[0].with_dose,4);assert.equal(r.ingredients[0].label_evidence,4);
 assert.equal(marketSummary(data,{country:'__unknown__'}).total,1);assert.equal(marketSummary(data,{country:'英国'}).products.length,0);
 assert.equal(marketSummary(data,{platform:'independent',metric:'count'}).total,0);
});
test('Country keyword counts and preview filtering/export retain the scoped counts',()=>{
 const rows=scopeKeywords(keywords,data.products,'越南');assert.equal(rows.find(k=>k.id===1).product_count,3);
 assert.equal(filterRows('keywords',rows,{country:'越南',search:'睡眠',sort:'matches'}).length,2);
 assert.equal(scopeKeywords(keywords,data.products,'英国').length,0);
});
test('Dashboard drilldowns combine country, category, source and ingredient in live and preview queries',()=>{
 const q={country:'越南',platform:'tiktok',scope:'supplements',ingredient:'mg'};
 const w=productWhere(queryOptions(q));assert.ok(w.sql.includes('JSON_EXTRACT'));assert.ok(w.args.includes('越南'));assert.ok(w.args.includes('mg'));
 assert.deepEqual(filterRows('products',data.products.map(p=>({...p,ingredient_keys:['mg']})),q).map(p=>p.id).sort(),[1,3,4,5]);
});
