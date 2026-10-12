import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeywordSeeds} from '../server/keyword-seeds.mjs';
import {compileKeywords,matchKeywords} from '../server/keywords.mjs';
import {productWhere,queryOptions} from '../server/repository.mjs';

test('Seed vocabulary has exactly 2000 unique bilingual candidates with no invented heat',()=>{
 const rows=generateKeywordSeeds();assert.equal(rows.length,2000);assert.equal(new Set(rows.map(k=>k.name_zh)).size,2000);assert.equal(new Set(rows.map(k=>k.name_en)).size,2000);assert.equal(rows.filter(k=>k.keyword_type==='topic').length,200);assert.equal(new Set(rows.map(k=>k.category)).size,20);assert.ok(rows.every(k=>k.name_zh&&k.name_en&&k.heat_status==='unverified'&&!k.search_volume));
});
test('Aliases handle punctuation and word boundaries without inferring medical efficacy',()=>{
 const rows=compileKeywords([{id:1,name_zh:'更年期',name_en:'menopause',aliases:['menopausal'],enabled:true},{id:2,name_zh:'抗衰',name_en:'anti aging',aliases:['anti-ageing'],enabled:true},{id:3,name_zh:'睡眠',name_en:'sleep',aliases:[],enabled:true}]);
 const hits=matchKeywords({name_original:'Menopausal Anti-Ageing Support',description_text:'Sleep support.'},rows);assert.deepEqual(hits.map(h=>h.keyword_id),[1,2,3]);assert.equal(hits[0].evidence_scope,'name');assert.equal(hits[2].evidence_scope,'description');assert.equal(matchKeywords({name_original:'sleeplessness'},rows).length,0);
});
test('Warning and negated mentions cannot become benefit associations',()=>{
 const rows=compileKeywords([{id:1,name_zh:'失眠',name_en:'insomnia',aliases:[],enabled:true}]);
 for(const description_text of ['Not intended to treat insomnia.','Consult a physician if you experience insomnia.'])assert.equal(matchKeywords({description_text},rows)[0].evidence_scope,'warning_or_negation');
 assert.equal(matchKeywords({name_original:'Insomnia Support',description_text:'Not intended to treat insomnia.'},rows)[0].evidence_scope,'name');
});
test('Disabled entries and search intent variants do not create redundant base-topic matches',()=>{
 const rows=compileKeywords(generateKeywordSeeds().map((k,i)=>({...k,id:i+1,enabled:k.name_zh!=='睡眠'})));
 const hits=matchKeywords({name_original:'Sleep Support'},rows);assert.equal(hits.length,0);
 assert.ok(matchKeywords({name_original:'Sleep supplements'},rows).some(h=>h.matched_term==='sleep supplements'));
});
test('Product keyword filtering requires active non-warning links and parameterizes the ID',()=>{
 const w=productWhere(queryOptions({keyword:'42'}));assert.match(w.sql,/k.enabled=1/);assert.match(w.sql,/warning_or_negation/);assert.deepEqual(w.args,[42]);assert.equal(productWhere(queryOptions({keyword:'42 OR 1=1'})).sql,'');
});
