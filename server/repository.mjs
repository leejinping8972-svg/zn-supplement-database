import {pool,jsonValue,AppError,transaction,requireSiteApproved} from './db.mjs';
import {createHash} from 'node:crypto';
import {syncProductKeywords,productKeywords} from './keywords.mjs';
import {salesCountryFields} from './sales-country.mjs';

export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const positive=value=>/^\d+$/.test(String(value))&&Number(value)>0;
const runStatsSql='(SELECT COUNT(*) FROM si_site_analysis_runs ar WHERE ar.site_id=si_sites.id) analysis_count,(SELECT MAX(started_at) FROM si_site_analysis_runs ar WHERE ar.site_id=si_sites.id) last_analyzed_at,(SELECT status FROM si_site_analysis_runs ar WHERE ar.site_id=si_sites.id ORDER BY run_number DESC LIMIT 1) last_analysis_status';
export function queryOptions(q={}){
 const page=Math.max(1,Math.min(100000,parseInt(q.page)||1));
 const limit=Math.max(1,Math.min(100,parseInt(q.limit)||25));
 const ids=q.ids?String(q.ids).split(',').filter(positive).slice(0,1000).map(Number):[];
 return {page,limit,ids,search:String(q.search||'').trim().slice(0,200),country:String(q.country||'').slice(0,190),category:String(q.category||'').slice(0,190),china:q.china,watched:q.watched,site:q.site,ingredient:String(q.ingredient||'').slice(0,100),status:q.status,keyword:q.keyword,sort:q.sort};
}
export function siteWhere(q){
 const clauses=[],args=[];
 if(q.search){clauses.push('(brand LIKE ? OR domain LIKE ? OR main_products LIKE ? OR intro LIKE ?)');args.push(...Array(4).fill('%'+q.search+'%'));}
 for(const field of ['country','category'])if(q[field]){clauses.push(field+' = ?');args.push(q[field]);}
 if(q.china==='clue')clauses.push("china_status LIKE '中资%'");
 if(q.china==='unknown')clauses.push("china_status NOT LIKE '中资%'");
 if(q.watched==='true')clauses.push('watched = 1');
 if(q.ids.length){clauses.push('id IN ('+q.ids.map(()=>'?').join(',')+')');args.push(...q.ids);}
 return {sql:clauses.length?' WHERE '+clauses.join(' AND '):'',args};
}
export function productWhere(q){
 const clauses=[],args=[];
 if(q.country==='__unknown__')clauses.push('p.sales_country IS NULL');
 else if(q.country){clauses.push('p.sales_country=?');args.push(q.country);}
 if(q.search){clauses.push('(p.name_original LIKE ? OR p.name_zh LIKE ? OR s.brand LIKE ? OR p.sales_country LIKE ? OR EXISTS (SELECT 1 FROM si_product_ingredients i WHERE i.product_id=p.id AND (i.name_zh LIKE ? OR i.name_original LIKE ?)))');args.push(...Array(6).fill('%'+q.search+'%'));}
 if(positive(q.site)){clauses.push('p.site_id=?');args.push(Number(q.site));}
 if(positive(q.keyword)){clauses.push('EXISTS (SELECT 1 FROM si_product_keywords pk JOIN si_keywords k ON k.id=pk.keyword_id WHERE pk.product_id=p.id AND pk.keyword_id=? AND k.enabled=1 AND pk.evidence_scope<>"warning_or_negation")');args.push(Number(q.keyword));}
 if(q.ingredient){clauses.push('EXISTS (SELECT 1 FROM si_product_ingredients i WHERE i.product_id=p.id AND i.canonical_key=?)');args.push(q.ingredient);}
 if(['pending','needs_review','reviewed'].includes(q.status)){clauses.push('p.analysis_status=?');args.push(q.status);}
 if(q.ids.length){clauses.push('p.id IN ('+q.ids.map(()=>'?').join(',')+')');args.push(...q.ids);}
 return {sql:clauses.length?' WHERE '+clauses.join(' AND '):'',args};
}
export async function listSites(input={},all=false){
 const q=queryOptions(input),w=siteWhere(q);
 const sorts={brand:'brand ASC',country:'country ASC,brand ASC',recent:'updated_at DESC',analysis:'analysis_count DESC,display_order ASC',default:'display_order ASC'};
 const [[{total}]]=await pool.query('SELECT COUNT(*) total FROM si_sites'+w.sql,w.args);
 const [rows]=await pool.query('SELECT si_sites.*,'+runStatsSql+' FROM si_sites'+w.sql+' ORDER BY '+(sorts[q.sort]||sorts.default)+(all?'':' LIMIT ? OFFSET ?'),all?w.args:[...w.args,q.limit,(q.page-1)*q.limit]);
 return {rows:rows.map(r=>({...r,watched:Boolean(r.watched)})),total,page:q.page,limit:q.limit};
}
export async function listProducts(input={},all=false){
 const q=queryOptions(input),w=productWhere(q),from=' FROM si_products p JOIN si_sites s ON s.id=p.site_id';
 const [[{total}]]=await pool.query('SELECT COUNT(*) total'+from+w.sql,w.args);
 const sorts={name:'p.name_original ASC',price:'p.price ASC',first:'p.first_seen_at DESC',default:'p.last_seen_at DESC'};
 const [rows]=await pool.query('SELECT p.*,s.brand,s.domain,(SELECT image_url FROM si_product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) image_url'+from+w.sql+' ORDER BY '+(sorts[q.sort]||sorts.default)+(all?' LIMIT 10000':' LIMIT ? OFFSET ?'),all?w.args:[...w.args,q.limit,(q.page-1)*q.limit]);
 const grouped=new Map();
 if(rows.length){const [links]=await pool.query('SELECT pk.product_id,k.id,k.name_zh,pk.evidence_scope FROM si_product_keywords pk JOIN si_keywords k ON k.id=pk.keyword_id WHERE k.enabled=1 AND pk.product_id IN ('+rows.map(()=>'?').join(',')+')',rows.map(r=>r.id));for(const l of links){if(!grouped.has(l.product_id))grouped.set(l.product_id,[]);grouped.get(l.product_id).push(l);}}
 return {rows:rows.map(r=>({...r,keywords:grouped.get(r.id)||[],analysis:jsonValue(r.analysis),raw_data:undefined})),total,page:q.page,limit:q.limit};
}
export async function siteDetail(id){
 const [[site]]=await pool.query('SELECT si_sites.*,'+runStatsSql+' FROM si_sites WHERE id=?',[id]);if(!site)throw new AppError(404,'站点不存在');
 const [[counts]]=await pool.query('SELECT COUNT(*) products,MAX(last_seen_at) last_collected_at FROM si_products WHERE site_id=?',[id]);
 return {...site,watched:Boolean(site.watched),...counts};
}
export async function productDetail(id){
 const [[product]]=await pool.query('SELECT p.*,s.brand,s.domain FROM si_products p JOIN si_sites s ON s.id=p.site_id WHERE p.id=?',[id]);
 if(!product)throw new AppError(404,'商品不存在');
 const [images]=await pool.query('SELECT * FROM si_product_images WHERE product_id=? ORDER BY sort_order',[id]);
 const [ingredients]=await pool.query('SELECT * FROM si_product_ingredients WHERE product_id=?',[id]);
 const [snapshots]=await pool.query('SELECT id,content_hash,captured_at FROM si_product_snapshots WHERE product_id=? ORDER BY captured_at DESC',[id]);
 return {...product,analysis:jsonValue(product.analysis),raw_data:jsonValue(product.raw_data),images,ingredients,snapshots,keywords:await productKeywords(id)};
}
export async function dashboard(){
 const [[counts]]=await pool.query("SELECT (SELECT COUNT(*) FROM si_sites) sites,(SELECT COUNT(*) FROM si_products) products,(SELECT COUNT(*) FROM si_sites WHERE china_status LIKE '中资%') chinaClues,(SELECT COUNT(*) FROM si_sites WHERE watched=1) watched,(SELECT COUNT(*) FROM si_products WHERE analysis_status<>'reviewed') pendingReview,(SELECT COUNT(*) FROM si_jobs WHERE status IN ('queued','running')) activeJobs");
 const [countries]=await pool.query('SELECT country,COUNT(*) count FROM si_sites GROUP BY country ORDER BY count DESC');
 const [categories]=await pool.query('SELECT DISTINCT category FROM si_sites ORDER BY category');
 const [ingredients]=await pool.query('SELECT canonical_key,name_zh,COUNT(DISTINCT product_id) products,SUM(amount_text IS NOT NULL) with_dose,SUM(evidence_scope="label_text") label_evidence FROM si_product_ingredients GROUP BY canonical_key,name_zh ORDER BY products DESC');
 return {counts,countries,categories:categories.map(r=>r.category),ingredients};
}
export async function saveProduct(site,product,analysis,jobId){
 return transaction(async c=>{
  await requireSiteApproved(site.id,c,true);
  const [[job]]=await c.query('SELECT cancel_requested FROM si_jobs WHERE id=? FOR UPDATE',[jobId]);
  if(!job||job.cancel_requested)throw new AppError(409,'任务已取消','JOB_CANCELLED');
  const market=salesCountryFields(site);
  const contentHash=hash(JSON.stringify({name:product.name_original,description:product.description_text,price:product.price,currency:product.currency,images:product.images}));
  const [[existing]]=await c.query('SELECT id,content_hash FROM si_products WHERE site_id=? AND url_hash=?',[site.id,hash(product.url)]);
  if(existing?.content_hash===contentHash){await c.query('UPDATE si_products SET sales_country=?,sales_country_basis=?,sales_country_source_url=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?',[market.sales_country,market.sales_country_basis,market.sales_country_source_url,existing.id]);await syncProductKeywords(c,existing.id,product);return {id:existing.id,changed:false};}
  const values=[site.id,market.sales_country,market.sales_country_basis,market.sales_country_source_url,product.url,hash(product.url),product.source_product_id||null,product.name_original,analysis.name_zh,analysis.translation_status,product.description_text,product.price,product.currency,analysis.dosage_form||null,product.serving_size||analysis.serving_size||null,product.source_language||null,analysis.analysis_status,JSON.stringify(analysis),JSON.stringify(product.raw_data||{}),contentHash];
  const [result]=await c.query(`INSERT INTO si_products (site_id,sales_country,sales_country_basis,sales_country_source_url,url,url_hash,source_product_id,name_original,name_zh,translation_status,description_text,price,currency,dosage_form,serving_size,source_language,analysis_status,analysis,raw_data,content_hash) VALUES (${values.map(()=>'?').join(',')}) ON DUPLICATE KEY UPDATE sales_country=VALUES(sales_country),sales_country_basis=VALUES(sales_country_basis),sales_country_source_url=VALUES(sales_country_source_url),name_original=VALUES(name_original),name_zh=VALUES(name_zh),translation_status=VALUES(translation_status),description_text=VALUES(description_text),price=VALUES(price),currency=VALUES(currency),dosage_form=VALUES(dosage_form),serving_size=VALUES(serving_size),source_language=VALUES(source_language),analysis_status=VALUES(analysis_status),analysis=VALUES(analysis),raw_data=VALUES(raw_data),content_hash=VALUES(content_hash),last_seen_at=CURRENT_TIMESTAMP`,values);
  const id=existing?.id||result.insertId;
  await c.query('DELETE FROM si_product_images WHERE product_id=?',[id]);
  for(const [order,img] of (product.images||[]).entries())await c.query('INSERT INTO si_product_images (product_id,image_url,alt_text,sort_order) VALUES (?,?,?,?)',[id,img.url,String(img.alt||product.name_original).slice(0,512),order]);
  await replaceIngredients(c,id,analysis.ingredients);
  await syncProductKeywords(c,id,product);
  await c.query('INSERT IGNORE INTO si_product_snapshots (product_id,content_hash,snapshot) VALUES (?,?,?)',[id,contentHash,JSON.stringify({product,analysis})]);
  return {id,changed:true};
 });
}
export async function replaceIngredients(c,id,ingredients=[]){
 await c.query('DELETE FROM si_product_ingredients WHERE product_id=?',[id]);
 for(const i of ingredients)await c.query('INSERT INTO si_product_ingredients (product_id,name_original,name_zh,canonical_key,amount_text,evidence_text,evidence_scope,method) VALUES (?,?,?,?,?,?,?,?)',[id,i.name_original,i.name_zh,i.canonical_key,i.amount_text||null,i.evidence_text,i.evidence_scope,i.method]);
}
