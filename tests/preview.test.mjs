import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRows,previewApi} from '../src/preview-api.mjs';
test('Read-only preview refuses every mutation before loading data',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE'])await assert.rejects(previewApi('/keywords',{method}),/只读预览/);
});
test('Preview filters combine product site, keyword, ingredient and selected IDs',()=>{
 const rows=[{id:1,site_id:5,name_original:'Sleep',name_zh:'睡眠',brand:'Fixture',ingredient_names:'镁',ingredient_keys:['magnesium'],analysis_status:'needs_review',keywords:[{id:3,evidence_scope:'description'}]},{id:2,site_id:5,name_original:'Sleep Warning',keywords:[{id:3,evidence_scope:'warning_or_negation'}]}];
 assert.deepEqual(filterRows('products',rows,{site:'5',keyword:'3',ingredient:'magnesium',search:'镁',ids:'1',status:'needs_review'}).map(r=>r.id),[1]);assert.equal(filterRows('products',rows,{keyword:'3'}).length,1);
});
test('Preview date ranges use Beijing dates and keyword aliases remain searchable',()=>{
 assert.equal(filterRows('analysis-runs',[{started_at:'2026-10-10T17:00:00Z'}],{from:'2026-10-11',to:'2026-10-11'}).length,1);
 assert.equal(filterRows('keywords',[{id:1,name_zh:'睡眠',name_en:'sleep',aliases:['sleeping'],enabled:true,keyword_type:'topic'}],{search:'sleeping',enabled:'true',type:'topic'}).length,1);
});
