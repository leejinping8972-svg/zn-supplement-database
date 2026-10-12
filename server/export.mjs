import ExcelJS from 'exceljs';
export const siteColumns=[['id','编号'],['brand','品牌'],['url','网址'],['country','所在国家'],['category','类别'],['intro','介绍'],['main_products','主要产品'],['public_address','公开地址'],['address_type','地址类型'],['country_note','国家依据'],['china_status','中国股权背景'],['china_ops','中国团队运营核验'],['china_summary','核验说明'],['china_source','中国背景来源'],['china_quote','依据原文'],['company_source','公司来源'],['source_date','资料日期'],['watched','关注'],['notes','备注']];
export const productColumns=[['id','编号'],['brand','站点品牌'],['url','商品网址'],['name_original','原文名称'],['name_zh','中文名称'],['translation_status','翻译状态'],['description_text','原文描述'],['price','价格'],['currency','币种'],['dosage_form','剂型'],['analysis_status','审核状态'],['ingredient_names','成分'],['ingredient_evidence','成分依据与剂量'],['image_urls','图片网址'],['first_seen_at','首次发现'],['last_seen_at','最近采集']];
siteColumns.push(['analysis_count','分析次数'],['last_analyzed_at','最近分析时间'],['last_analysis_status','最近分析结果']);
productColumns.push(['keyword_names','关联功效关键字']);
export const keywordColumns=[['id','编号'],['name_zh','中文关键字'],['name_en','英文关键字'],['aliases','匹配别名'],['category','功效类别'],['keyword_type','词类型'],['enabled','启用'],['product_count','商品匹配数'],['heat_status','热度核验'],['search_volume','月搜索量'],['heat_source','热度来源'],['heat_market','市场'],['heat_date','热度数据日期'],['source','建词来源']];
export const runColumns=[['id','记录编号'],['brand','站点'],['domain','域名'],['run_number','本站第几次分析'],['analysis_count','本站累计分析次数'],['run_type','任务类型'],['status','结果'],['products_processed','处理商品数'],['started_at','开始时间'],['finished_at','结束时间'],['error_message','失败原因'],['job_id','关联任务']];
export function csvCell(value){const s=value===null||value===undefined?'':String(value);return '"'+(/^[\s]*[=+\-@]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
export async function exportData(rows,columns,format){
 if(format==='json')return {body:JSON.stringify(rows,null,2),mime:'application/json; charset=utf-8'};
 rows=rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):v])));
 if(format==='csv')return {body:'\uFEFF'+[columns.map(c=>csvCell(c[1])).join(','),...rows.map(r=>columns.map(c=>csvCell(r[c[0]])).join(','))].join('\r\n'),mime:'text/csv; charset=utf-8'};
 const wb=new ExcelJS.Workbook();wb.creator='ZN保健品数据库';const ws=wb.addWorksheet('数据库导出',{views:[{state:'frozen',ySplit:1}]});
 ws.columns=columns.map(([key,header])=>({key,header,width:['intro','description_text','ingredient_evidence','china_summary','notes'].includes(key)?45:24}));
 rows.forEach(row=>ws.addRow(Object.fromEntries(columns.map(([k])=>[k,typeof row[k]==='boolean'?(row[k]?'是':'否'):row[k]??'']))));
 ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF7553B7'}};ws.getRow(1).height=26;
 ws.eachRow((row,n)=>{row.alignment={vertical:'top',wrapText:true};if(n>1){row.height=48;if(n%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F5'}};}});
 ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:columns.length}};
 return {body:await wb.xlsx.writeBuffer(),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
}
