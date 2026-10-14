import {pool,transaction,AppError,jsonValue} from './db.mjs';
import {generateKeywordSeeds} from './keyword-seeds.mjs';

let cache=null;
export const invalidateKeywords=()=>{cache=null;};
const normalize=t=>String(t||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ').trim();
const escape=t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function compileKeywords(rows){return rows.filter(k=>k.enabled!==false&&k.enabled!==0).map(k=>({...k,patterns:[k.name_zh,k.name_en,...(jsonValue(k.aliases)||[])].filter(Boolean).map(term=>({term,regex:new RegExp((/[a-z0-9]/i.test(term)?'(?<![a-z0-9])':'')+escape(normalize(term))+(/[a-z0-9]/i.test(term)?'(?![a-z0-9])':''),'i')}))}));}
export function matchKeywords(product,keywords){
 const sources=[['name',normalize(product.name_original)],['description',normalize(product.description_text)]];const matches=[];
 for(const k of keywords){let best;
  for(const [scope,text] of sources){const normalized=text;
   for(const {term,regex} of k.patterns){
    const match=regex.exec(normalized);if(!match)continue;
    const start=Math.max(0,normalized.lastIndexOf('.',match.index-1)+1,normalized.lastIndexOf('\n',match.index-1)+1);
    const prefix=normalized.slice(Math.max(start,match.index-150),match.index);
    const context=normalized.slice(Math.max(0,match.index-120),Math.min(normalized.length,match.index+term.length+180));
    // Warning and negation mentions remain visible, but are not treated as benefits.
    const flagged=/\b(not|no|without|avoid|contraindicat\w*|consult|warning|pregnant|diagnose|treat|cure|prevent)\b|không|chống chỉ định|cảnh báo|tham khảo ý kiến|不适用|不能|禁用|警告|咨询医生/.test(prefix);
    const hit={keyword_id:k.id,matched_term:term,evidence_text:context,evidence_scope:flagged?'warning_or_negation':scope};
    if(!best||best.evidence_scope==='warning_or_negation')best=hit;
   }
   if(best&&best.evidence_scope!=='warning_or_negation')break;
  }
  if(best)matches.push(best);
 }return matches;
}
async function vocabulary(){if(!cache){const [rows]=await pool.query('SELECT * FROM si_keywords WHERE enabled=1');cache=compileKeywords(rows);}return cache;}
export async function syncProductKeywords(c,id,product){
 const words=await vocabulary(),matches=matchKeywords(product,words);await c.query('DELETE FROM si_product_keywords WHERE product_id=?',[id]);
 if(matches.length)await c.query('INSERT INTO si_product_keywords (product_id,keyword_id,matched_term,evidence_text,evidence_scope) VALUES ?',[matches.map(m=>[id,m.keyword_id,m.matched_term,m.evidence_text,m.evidence_scope])]);
 const concepts=matches.filter(m=>m.evidence_scope!=='warning_or_negation'&&words.find(w=>w.id===m.keyword_id)?.keyword_type==='topic').map(m=>({name_zh:words.find(w=>w.id===m.keyword_id).name_zh,evidence_text:m.evidence_text,method:'explicit_topic_mention'}));
 await c.query("UPDATE si_products SET concepts=? WHERE id=? AND source_platform='tiktok'",[JSON.stringify(concepts),id]);
 return matches.length;
}
export async function productKeywords(id,c=pool){const [rows]=await c.query('SELECT k.id,k.name_zh,k.name_en,k.category,k.enabled,pk.matched_term,pk.evidence_text,pk.evidence_scope,pk.matched_at FROM si_product_keywords pk JOIN si_keywords k ON k.id=pk.keyword_id WHERE pk.product_id=? ORDER BY k.keyword_type,k.name_zh',[id]);return rows;}
export async function listKeywords(q={},all=false){
 const clauses=[],args=[],page=Math.max(1,Math.min(100000,parseInt(q.page)||1)),limit=Math.max(1,Math.min(100,parseInt(q.limit)||25));
 if(q.search){clauses.push('(k.name_zh LIKE ? OR k.name_en LIKE ? OR CAST(k.aliases AS CHAR) LIKE ?)');args.push(...Array(3).fill('%'+String(q.search).slice(0,200)+'%'));}
 if(q.category){clauses.push('k.category=?');args.push(String(q.category).slice(0,100));}
 if(['true','false'].includes(q.enabled)){clauses.push('k.enabled=?');args.push(q.enabled==='true');}
 if(['topic','intent'].includes(q.type)){clauses.push('k.keyword_type=?');args.push(q.type);}
 const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
 const [[{total}]]=await pool.query('SELECT COUNT(*) total FROM si_keywords k'+where,args);
 const order=q.sort==='volume'?'k.search_volume IS NULL,k.search_volume DESC,k.id':q.sort==='matches'?'product_count DESC,k.id':'k.id';
 const [rows]=await pool.query('SELECT k.*,(SELECT COUNT(*) FROM si_product_keywords pk WHERE pk.keyword_id=k.id AND pk.evidence_scope<>"warning_or_negation") product_count FROM si_keywords k'+where+' ORDER BY '+order+(all?'':' LIMIT ? OFFSET ?'),all?args:[...args,limit,(page-1)*limit]);
 const [categories]=await pool.query('SELECT category,COUNT(*) count FROM si_keywords GROUP BY category ORDER BY category');
 return {rows:rows.map(k=>({...k,aliases:jsonValue(k.aliases),enabled:Boolean(k.enabled)})),total,categories,page,limit};
}
export async function seedKeywords(){
 const seeds=generateKeywordSeeds();
 await transaction(async c=>{
  await c.query('INSERT IGNORE INTO si_keywords (name_zh,name_en,category,aliases,keyword_type,source,heat_status) VALUES ?',[seeds.map(k=>[k.name_zh,k.name_en,k.category,JSON.stringify(k.aliases),k.keyword_type,k.source,k.heat_status])]);
  await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['keywords_seeded','local_user',JSON.stringify({count:seeds.length,source:'editorial_taxonomy_v1',heat:'unverified'})]);
 });invalidateKeywords();return seeds.length;
}
export async function saveKeyword(id,data){
 const result=await transaction(async c=>{
  if(id){const [[row]]=await c.query('SELECT id FROM si_keywords WHERE id=? FOR UPDATE',[id]);if(!row)throw new AppError(404,'关键字不存在');}
  const values=[data.name_zh,data.name_en,data.category,JSON.stringify(data.aliases),data.enabled,data.keyword_type];
  let key=id;
  try{if(id)await c.query('UPDATE si_keywords SET name_zh=?,name_en=?,category=?,aliases=?,enabled=?,keyword_type=? WHERE id=?',[...values,id]);
  else{const [r]=await c.query('INSERT INTO si_keywords (name_zh,name_en,category,aliases,enabled,keyword_type) VALUES (?,?,?,?,?,?)',values);key=r.insertId;}}
  catch(e){if(e.code==='ER_DUP_ENTRY')throw new AppError(409,'中文关键字已存在');throw e;}
  await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['keyword_saved','local_user',JSON.stringify({id:key,...data})]);return key;
 });invalidateKeywords();return {id:result,rematchRequired:true};
}
export async function deleteKeyword(id){await transaction(async c=>{const [r]=await c.query('DELETE FROM si_keywords WHERE id=?',[id]);if(!r.affectedRows)throw new AppError(404,'关键字不存在');await c.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['keyword_deleted','local_user',JSON.stringify({id})]);});invalidateKeywords();return {ok:true};}
export async function rematchAll(){
 let last=0,total=0,links=0;
 while(true){const [rows]=await pool.query('SELECT id,name_original,description_text FROM si_products WHERE id>? ORDER BY id LIMIT 100',[last]);if(!rows.length)break;
  for(const p of rows){links+=await transaction(async c=>{const [[fresh]]=await c.query('SELECT name_original,description_text FROM si_products WHERE id=? FOR UPDATE',[p.id]);return fresh?syncProductKeywords(c,p.id,fresh):0;});total++;last=p.id;}
 }return {products:total,links};
}
