// Derived only from saved, observed EchoTik listing cells. Unknown is never zero.
export function parseQuantity(value){
 const m=String(value??'').trim().match(/^([\d,]+(?:\.\d+)?)\s*(万|亿|[kKmM])?$/);
 if(!m||!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(m[1]))return null;
 const n=Number(m[1].replaceAll(',',''))*({万:1e4,亿:1e8,k:1e3,m:1e6}[m[2]?.toLowerCase()]||1);
 return Number.isFinite(n)?Math.round(n):null;
}
export function listingMetrics(raw){
 if(raw?.source!=='echotik_observed_page')return null;
 const text=raw.listing_text||'',cells=text.split('\t').map(s=>s.trim());
 const labeled=text.match(/(?:^|\n)近7天销量[：:]([^\n]+)/);
 // Legacy US capture has ten table cells in a documented column order.
 const value=labeled?.[1]??(cells.length>=9?cells[2]:null);
 const sales=parseQuantity(value),date=raw.country_evidence?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
 return sales===null||!date?null:{sales_7d:sales,observed_on:date,source:'EchoTik',period_days:7,approximate:/万|亿|[kKmM]/.test(value)};
}
export const inCountry=(p,country)=>!country|| (country==='__unknown__'?!p.sales_country:p.sales_country===country);
export function scopeKeywords(keywords,products,country){
 const counts=new Map();
 for(const p of products.filter(p=>inCountry(p,country)))for(const id of new Set((p.keywords||[]).filter(k=>k.evidence_scope!=='warning_or_negation').map(k=>k.id)))counts.set(id,(counts.get(id)||0)+1);
 return keywords.map(k=>({...k,product_count:counts.get(k.id)||0})).filter(k=>!country||k.product_count>0);
}
export function marketSummary(data,{country='',metric='sales',platform='',scope='all'}={}){
 const products=data.products.filter(p=>inCountry(p,country)&&(!platform||p.source_platform===platform)&&(scope!=='supplements'||p.supplement_category));
 const measured=products.filter(p=>p.metrics?.sales_7d!=null),dates=[...new Set(measured.map(p=>p.metrics.observed_on))].sort();
 // Sales rankings use only the latest observation day in this scope, never mixed dates.
 const date=dates.at(-1)||null,comparable=measured.filter(p=>p.metrics.observed_on===date),eligible=new Set(comparable.map(p=>p.id));
 const kw=new Map(data.keywords.filter(k=>k.enabled&&k.keyword_type==='topic').map(k=>[k.id,k]));
 const ingredients=new Map(),topics=new Map();
 function add(map,key,name,p,extra={}){let r=map.get(key);if(!r){r={key,name,products:0,measured:0,sales:0,with_dose:0,label_evidence:0};map.set(key,r);}r.products++;if(eligible.has(p.id)){r.measured++;r.sales+=p.metrics.sales_7d;}r.with_dose+=Number(Boolean(extra.with_dose));r.label_evidence+=Number(Boolean(extra.label_evidence));}
 for(const p of products){
  const unique=new Map();for(const i of p.ingredients||[]){const old=unique.get(i.key)||{};unique.set(i.key,{...i,with_dose:old.with_dose||i.with_dose,label_evidence:old.label_evidence||i.label_evidence});}
  for(const i of unique.values())add(ingredients,i.key,i.name,p,i);
  for(const id of new Set((p.keywords||[]).filter(k=>k.evidence_scope!=='warning_or_negation').map(k=>k.id)))if(kw.has(id))add(topics,id,kw.get(id).name_zh,p);
 }
 const rank=map=>[...map.values()].filter(r=>metric!=='sales'||r.measured>0).sort((a,b)=>(metric==='sales'?b.sales-a.sales:b.products-a.products)||String(a.key).localeCompare(String(b.key)));
 return {country,total:products.length,measured:comparable.length,missing:products.length-comparable.length,date,dates,metric,
 products:[...comparable].sort((a,b)=>(b.metrics?.sales_7d??-1)-(a.metrics?.sales_7d??-1)||a.id-b.id).slice(0,20),
 topics:rank(topics).slice(0,20),ingredients:rank(ingredients).slice(0,20),
 ingredientDistribution:[...ingredients.values()].sort((a,b)=>b.products-a.products).map(r=>({...r,canonical_key:r.key,name_zh:r.name}))};
}
