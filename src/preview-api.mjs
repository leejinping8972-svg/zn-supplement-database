const cache=new Map();
async function data(name){if(!cache.has(name))cache.set(name,fetch(import.meta.env.BASE_URL+'data/'+name+'.json').then(r=>{if(!r.ok)throw new Error('预览数据读取失败');return r.json();}).catch(e=>{cache.delete(name);throw e;}));return cache.get(name);}
export function filterRows(kind,rows,q){
 const search=(q.search||'').trim().toLowerCase(),ids=q.ids?.split(',').map(Number);
 let result=rows.filter(r=>{
  if(ids?.length&&!ids.includes(r.id))return false;
  const terms=kind==='sites'?[r.brand,r.domain,r.main_products,r.intro]:kind==='products'?[r.name_original,r.name_zh,r.brand,r.ingredient_names]:kind==='keywords'?[r.name_zh,r.name_en,...r.aliases]:[r.brand,r.domain];
  if(search&&!terms.join(' ').toLowerCase().includes(search))return false;
  if(q.country&&r.country!==q.country||q.category&&r.category!==q.category)return false;
  if(q.china==='clue'&&!r.china_status.startsWith('中资')||q.china==='unknown'&&r.china_status.startsWith('中资'))return false;
  if(q.watched==='true'&&!r.watched)return false;
  if(q.site&&r.site_id!==Number(q.site))return false;
  if(q.status&&(kind==='products'?r.analysis_status:r.status)!==q.status)return false;
  if(q.ingredient&&!r.ingredient_keys?.includes(q.ingredient))return false;
  if(q.keyword&&!r.keywords?.some(k=>k.id===Number(q.keyword)&&k.evidence_scope!=='warning_or_negation'))return false;
  if(q.type&&r.keyword_type!==q.type||q.enabled&&r.enabled!==(q.enabled==='true'))return false;
  if((q.from||q.to)&&r.started_at){const day=new Date(new Date(r.started_at).getTime()+8*3600000).toISOString().slice(0,10);if(q.from&&day<q.from||q.to&&day>q.to)return false;}
  return true;
 });
 const text=(a,b)=>String(a||'').localeCompare(String(b||''),'zh-CN');
 result.sort((a,b)=>q.sort==='brand'?text(a.brand,b.brand):q.sort==='country'?text(a.country,b.country):q.sort==='name'?text(a.name_original,b.name_original):q.sort==='price'?(a.price??Infinity)-(b.price??Infinity):q.sort==='first'?text(b.first_seen_at,a.first_seen_at):q.sort==='recent'?text(b.last_analyzed_at,a.last_analyzed_at):q.sort==='matches'?b.product_count-a.product_count:q.sort==='volume'?(b.search_volume??-1)-(a.search_volume??-1):kind==='products'?text(b.last_seen_at,a.last_seen_at):kind==='analysis-runs'?text(b.started_at,a.started_at):kind==='sites'?a.display_order-b.display_order:a.id-b.id);
 return result;
}
export async function previewApi(value,options={}){
 if(options.method&&!['GET','HEAD'].includes(options.method))throw new Error('这是只读预览，修改和采集请使用本地系统。');
 const url=new URL(value,'https://preview.invalid'),q=Object.fromEntries(url.searchParams),parts=url.pathname.split('/').filter(Boolean),kind=parts[0];
 if(kind==='overview')return data('overview');
 if(kind==='sites'&&parts[2]==='analysis-runs')return previewApi('/analysis-runs?'+new URLSearchParams({...q,site:parts[1]}));
 if(kind==='sites'&&parts[1])return (await data('sites')).find(s=>s.id===Number(parts[1]));
 if(kind==='products'&&parts[1]){const p=(await data('catalog')).find(p=>p.id===Number(parts[1]));if(!p)throw new Error('商品不存在');return (await data('products/'+p.part))[p.id];}
 const file={sites:'sites',products:'catalog',keywords:'keywords','analysis-runs':'runs'}[kind];if(!file)throw new Error('此功能仅在本地完整系统提供');
 const all=await data(file),rows=filterRows(kind,all,q),page=Math.max(1,Number(q.page)||1),limit=Math.min(100,Math.max(1,Number(q.limit)||25));
 return {rows:rows.slice((page-1)*limit,page*limit),total:rows.length,page,limit,...(kind==='keywords'?{categories:[...new Set(all.map(k=>k.category))].map(category=>({category}))}:{})};
}
export async function previewExport(kind,filters,format){
 let rows=filterRows(kind,await data({sites:'sites',products:'catalog',keywords:'keywords','analysis-runs':'runs'}[kind]),filters);
 if(kind==='keywords')rows=rows.map(k=>({...k,aliases:k.aliases.join('；')}));
 if(kind==='products')rows=rows.map(p=>({...p,keyword_names:p.keywords.filter(k=>k.evidence_scope!=='warning_or_negation').map(k=>k.name_zh).join('；'),image_urls:p.image_url}));
 const {exportData,siteColumns,productColumns,keywordColumns,runColumns}=await import('../server/export.mjs');
 const columns=kind==='products'?productColumns.filter(([key])=>!['description_text','ingredient_evidence'].includes(key)):kind==='sites'?siteColumns:kind==='keywords'?keywordColumns:runColumns;
 const result=await exportData(rows,columns,format);return new Blob([result.body],{type:result.mime});
}
