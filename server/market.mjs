import {pool,jsonValue} from './db.mjs';
import {listingMetrics} from '../shared/market.mjs';
export async function marketData(){
 const [[products],[ingredients],[links],[keywords]]=await Promise.all([
  pool.query('SELECT id,name_original,name_zh,sales_country,source_platform,shop_name,research_url,CASE WHEN source_platform=\'tiktok\' THEN raw_data ELSE NULL END raw_data FROM si_products'),
  pool.query('SELECT product_id,canonical_key,name_zh,amount_text,evidence_scope FROM si_product_ingredients'),
  pool.query('SELECT pk.product_id,pk.keyword_id id,pk.evidence_scope FROM si_product_keywords pk JOIN si_keywords k ON k.id=pk.keyword_id'),
  pool.query('SELECT id,name_zh,enabled,keyword_type FROM si_keywords')]);
 const byId=new Map(products.map(p=>{const raw=jsonValue(p.raw_data)||{};const {raw_data,...safe}=p;return [p.id,{...safe,metrics:listingMetrics(raw),supplement_category:/(?:^|\n)(?:保健食品|美容保健食品|健身保健食品)(?:\n|$)/.test(raw.listing_text||''),ingredients:[],keywords:[]}];}));
 for(const i of ingredients)byId.get(i.product_id)?.ingredients.push({key:i.canonical_key,name:i.name_zh,with_dose:Boolean(i.amount_text),label_evidence:i.evidence_scope==='label_text'});
 for(const k of links)byId.get(k.product_id)?.keywords.push({id:k.id,evidence_scope:k.evidence_scope});
 return {products:[...byId.values()],keywords};
}
