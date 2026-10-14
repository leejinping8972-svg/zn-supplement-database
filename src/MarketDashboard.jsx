import React,{useState} from 'react';
import {ArrowUpRight,BarChart3} from 'lucide-react';
const number=n=>Number(n||0).toLocaleString('zh-CN');
export default function MarketDashboard({overview,version,useData,openDetail,openProducts}){
 const [country,setCountry]=useState(''),[metric,setMetric]=useState('sales'),[platform,setPlatform]=useState(''),[scope,setScope]=useState('all');
 const result=useData('/market?'+new URLSearchParams({country,metric,platform,scope}),version),d=result.data;
 return <section className="market-dashboard">
  <div className="market-heading"><div><span className="market-kicker">COUNTRY / PRODUCT / DEMAND</span><h2>看清一个市场，正在卖什么。</h2><p>用已收录商品的销量与文本证据，比较产品、功效和成分。</p></div><BarChart3 size={38} strokeWidth={1.2}/></div>
  <div className="filters market-filters">
   <label>销售国家<select aria-label="仪表盘销售国家" value={country} onChange={e=>setCountry(e.target.value)}><option value="">全部销售国家</option>{overview?.productCountries.map(c=><option key={c.country}>{c.country}</option>)}<option value="__unknown__">国家待确认</option></select></label>
   <label>商品来源<select aria-label="仪表盘商品来源" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">全部来源</option><option value="tiktok">TikTok</option><option value="independent">独立站</option></select></label>
   <label>商品范围<select aria-label="仪表盘商品范围" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">全部收录商品</option><option value="supplements">EchoTik 保健食品类目</option></select></label>
   <label>功效 / 成分排序<select aria-label="排名指标" value={metric} onChange={e=>setMetric(e.target.value)}><option value="sales">关联商品近 7 天销量</option><option value="count">关联商品数量</option></select></label>
  </div>
  {result.error?<div className="error-banner">{result.error}</div>:result.loading?<div className="loading-line">正在汇总国家数据…</div>:d&&<>
   <div className="market-coverage"><div><span>当前市场收录</span><strong>{number(d.total)}<small>件商品</small></strong></div><div><span>本次销量排名覆盖</span><strong>{number(d.measured)}<small>件 / {d.total?Math.round(d.measured/d.total*100):0}%</small></strong></div><div><span>缺少同期销量</span><strong>{number(d.missing)}<small>件未参与销量排名</small></strong></div><div><span>销量资料采集日期</span><strong className="market-date">{d.date||'暂无销量资料'}</strong><small>采集时显示的近 7 天 · 非实时</small></div></div>
   <p className="market-method">销量来自 EchoTik，含平台缩写近似值，只代表已收录样本。功效和成分按关联商品销量去重汇总，不同词之间可能重叠，不能相加；成分提及和营销功效仍需核验。{d.dates.length>1?' 当前只使用最新采集日期的销量。':''}{scope==='supplements'?' 范围限 EchoTik 明确标注的保健食品、美容保健食品、健身保健食品。':''}</p>
   <div className="market-rank-grid">
    <RankList title="功效概念排行" subtitle={metric==='sales'?'关联商品近 7 天销量合计':'关联商品数量 · 不代表市场热度'} rows={d.topics} metric={metric} onOpen={r=>openProducts({id:r.key,name_zh:r.name,country,platform,scope})}/>
    <RankList title="成分排行" subtitle={metric==='sales'?'关联商品近 7 天销量合计':'关联商品数量 · 不代表市场热度'} rows={d.ingredients} metric={metric} onOpen={r=>openProducts({ingredient:r.key,country,platform,scope})}/>
   </div>
   <div className="table-heading market-product-heading"><div className="section-title"><h2>商品销量榜</h2><span>TOP 20 · 近 7 天销量</span></div></div>
   {d.products.length?<div className="table-wrap"><table className="market-product-table"><thead><tr><th>排名</th><th>商品 / 店铺</th><th>销售国家</th><th>近 7 天销量</th><th>数据来源</th></tr></thead><tbody>{d.products.map((p,index)=><tr key={p.id}><td><span className="market-rank-number">{String(index+1).padStart(2,'0')}</span></td><td><button className="text-button market-product-name" onClick={()=>openDetail('products',p.id)}>{p.name_zh||p.name_original}<ArrowUpRight size={14}/></button><small className="cell-sub">{p.shop_name||'店铺待确认'}</small></td><td>{p.sales_country||'待确认'}</td><td><strong>{p.metrics.approximate?'约 ':''}{number(p.metrics.sales_7d)}</strong></td><td>EchoTik<small className="cell-sub">{p.metrics.observed_on}</small></td></tr>)}</tbody></table></div>:<div className="market-empty">当前国家或来源没有可用销量。可切换国家或来源，或将功效 / 成分排序切换为“关联商品数量”查看收录分布。</div>}
  </>}
 </section>;
}
function RankList({title,subtitle,rows,metric,onOpen}){
 const value=r=>metric==='sales'?r.sales:r.products,max=value(rows[0]||{})||1;
 return <section className="market-rank-panel"><header><h3>{title}</h3><span>TOP 20</span></header><p>{subtitle}</p><div className="market-rank-scroll">{rows.length?rows.map((r,index)=><button className="market-rank-row" key={r.key} onClick={()=>onOpen(r)} aria-label={'查看'+r.name+'关联商品'}><span className="market-rank-number">{String(index+1).padStart(2,'0')}</span><span className="market-rank-body"><span><strong>{r.name}</strong><b>{number(value(r))}</b></span><span className="market-bar"><i style={{width:Math.max(1,value(r)/max*100)+'%'}}/></span><small>关联 {number(r.products)} 件 · 有同期销量 {number(r.measured)} 件</small></span><ArrowUpRight size={15}/></button>):<div className="market-empty">当前筛选暂无可排名的记录。</div>}</div></section>;
}
