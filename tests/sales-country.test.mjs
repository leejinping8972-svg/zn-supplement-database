import test from 'node:test';
import assert from 'node:assert/strict';
import {salesCountryFields} from '../server/sales-country.mjs';
import {productWhere,queryOptions} from '../server/repository.mjs';
import {filterRows} from '../src/preview-api.mjs';
import {exportData,productColumns} from '../server/export.mjs';

test('Sales country follows the source storefront, not the product brand or domain suffix',()=>{
 const fields=salesCountryFields({country:'越南',url:'https://example.us/',country_note:'越南经营联系地址',brand:'US Brand'});
 assert.equal(fields.sales_country,'越南');assert.equal(fields.sales_country_source_url,'https://example.us/');assert.match(fields.sales_country_basis,/待核验/);
 for(const country of ['',null,'待核验','未知','未确认','unknown'])assert.equal(salesCountryFields({country,url:'https://example.com/'}).sales_country,null);
});
test('Live and preview product filters use sales country and combine with site selection',()=>{
 const q=queryOptions({country:'越南',site:'401'}),where=productWhere(q);
 assert.match(where.sql,/p.sales_country=\?/);assert.deepEqual(where.args,['越南',401]);
 const unsafe=productWhere(queryOptions({country:"越南' OR 1=1 --"}));assert.ok(!unsafe.sql.includes('1=1'));assert.equal(unsafe.args[0],"越南' OR 1=1 --");
 const rows=[{id:1,site_id:401,sales_country:'越南'},{id:2,site_id:402,sales_country:'美国'},{id:3,site_id:403,sales_country:null}];
 assert.deepEqual(filterRows('products',rows,{country:'越南',site:'401'}).map(p=>p.id),[1]);
 assert.deepEqual(filterRows('products',rows,{country:'__unknown__'}).map(p=>p.id),[3]);
 assert.deepEqual(filterRows('products',rows,{search:'越南'}).map(p=>p.id),[1]);
 assert.match(productWhere(queryOptions({country:'__unknown__'})).sql,/sales_country IS NULL/);
});
test('Product exports include sales country and its evidence source',async()=>{
 const row={id:1,...salesCountryFields({country:'越南',url:'https://example.us/'})};
 const csv=await exportData([row],productColumns,'csv');assert.match(csv.body,/销售国家/);assert.match(csv.body,/越南/);assert.match(csv.body,/https:\/\/example.us\//);
 const json=await exportData([row],productColumns,'json');assert.equal(JSON.parse(json.body)[0].sales_country,'越南');
});
