// Dropdowns need every site, while table endpoints intentionally remain paginated.
export async function loadSiteOptions(request,options={}){
 const rows=[];let page=1,total=0;
 do{
  options.signal?.throwIfAborted();
  const result=await request('/sites?limit=100&page='+page,options);
  total=result.total;
  if(!result.rows.length&&rows.length<total)throw new Error('站点列表未完整加载，请刷新重试');
  rows.push(...result.rows);page++;
 }while(rows.length<total);
 return {rows:[...new Map(rows.map(row=>[row.id,row])).values()],total};
}
