import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductPage,productLinks} from '../server/parser.mjs';
import {ruleAnalysis} from '../server/analysis.mjs';
import {compileKeywords,matchKeywords} from '../server/keywords.mjs';
test('Vietnamese Sapo product metadata parses VND and excludes category pages',()=>{
 const html='<html lang="vi"><meta property="og:type" content="product"><meta property="og:price:amount" content="390.000₫"><meta property="og:price:currency" content="VND"><meta property="og:image" content="https://example.com/p.png"><h1>Viên uống kẽm</h1><div id="tab-1">Thành phần: Kẽm 15 mg. Hỗ trợ hệ miễn dịch, bổ sung dinh dưỡng.</div></html>';
 const p=parseProductPage(html,'https://example.com/p');assert.equal(p.price,390000);assert.equal(p.currency,'VND');assert.match(p.description_text,/Kẽm 15 mg/);assert.equal(p.images.length,1);
 assert.equal(p.raw_data.source,'product_opengraph');assert.equal(p.raw_data.jsonld,undefined);
 assert.equal(parseProductPage(html.replace('content="product"','content="website"'),'https://example.com/category'),null);
});
test('Vietnamese label evidence and aliases associate with existing topic IDs',()=>{
 const p={name_original:'Viên nang kẽm',description_text:'Thành phần: Kẽm 15 mg. Hướng dẫn sử dụng: theo hướng dẫn.',raw_data:{}};
 const a=ruleAnalysis(p);assert.equal(a.ingredients[0].canonical_key,'zinc');assert.equal(a.ingredients[0].amount_text,'15 mg');assert.match(a.name_zh,/胶囊/);
 const keywords=compileKeywords([{id:11,name_zh:'睡眠',name_en:'sleep',aliases:['ngủ ngon'],enabled:true}]);
 assert.equal(matchKeywords({description_text:'Hỗ trợ ngủ ngon.'},keywords)[0].keyword_id,11);
 assert.equal(matchKeywords({description_text:'Không hỗ trợ ngủ ngon.'},keywords)[0].evidence_scope,'warning_or_negation');
});
test('WooCommerce and Vietnamese product paths are discovered',()=>{
 assert.deepEqual(productLinks('<a class="woocommerce-LoopProduct-link" href="/magie">Magie</a><a href="/san-pham/kem">Kẽm</a><a href="/blog/a">Blog</a>','https://example.com'),['https://example.com/magie','https://example.com/san-pham/kem']);
});
test('Preservative claims do not cut off Vietnamese ingredients and composition headings identify doses',()=>{
 const product={name_original:'B Complex',description_text:'Không chứa chất bảo quản. Bảng Thành Phần: Vitamin B1: 6 mg. Bảo quản: nơi khô ráo.',raw_data:{}};
 const result=ruleAnalysis(product);assert.equal(result.ingredients.find(i=>i.canonical_key==='thiamin')?.amount_text,'6 mg');
 const mentions=ruleAnalysis({...product,description_text:'Không chứa chất bảo quản. Magnesium hỗ trợ sức khỏe.'});assert.equal(mentions.ingredients[0].canonical_key,'magnesium');assert.equal(mentions.ingredients[0].evidence_scope,'description_mention');
});
