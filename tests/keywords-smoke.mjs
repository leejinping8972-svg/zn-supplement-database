import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import ExcelJS from 'exceljs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/vanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3210',out=path.resolve('test-artifacts');await fs.mkdir(out,{recursive:true});
async function api(url,method='GET',body){const r=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json','X-App-Request':'NutraScope'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,await r.clone().text());return r.json();}
const seeds=await api('/keywords?limit=1');assert.equal(seeds.total,2000);assert.equal(seeds.categories.length,20);
const sleep=(await api('/keywords?search=睡眠&type=topic')).rows.find(k=>k.name_zh==='睡眠');assert.ok(sleep.product_count>0);assert.equal(sleep.search_volume,null);
const p=await api('/products?keyword='+sleep.id+'&site=1');assert.ok(p.total>0);assert.ok(p.rows.every(p=>p.keywords.some(k=>k.id===sleep.id&&k.evidence_scope!=='warning_or_negation')));
const detail=await api('/products/'+p.rows[0].id);assert.ok(detail.keywords.some(k=>k.id===sleep.id&&k.evidence_text));
const exportResponse=await fetch(base+'/api/export/keywords?format=xlsx');assert.equal(exportResponse.status,200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));assert.equal(wb.worksheets[0].rowCount,2001);assert.equal(wb.worksheets[0].getCell('B1').value,'中文关键字');
const jobs=await api('/jobs');assert.ok(jobs.some(j=>j.job_type==='crawl'&&j.options.siteIds.length===100));assert.equal((await api('/overview')).approval.allowedSiteIds,undefined);
const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
let temporary;
try{
 await page.goto(base);await page.waitForSelector('.site-table tbody tr');await page.screenshot({path:path.join(out,'purple-sites-desktop.png'),fullPage:true});
 await page.locator('nav').getByRole('button',{name:'关键字',exact:true}).click();await page.waitForSelector('.keyword-table tbody tr');await page.screenshot({path:path.join(out,'keywords-desktop.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--green').trim()),'#7553b7');
 await page.getByLabel('搜索关键字').fill('更年期');await page.waitForTimeout(600);assert.match(await page.locator('.keyword-table').textContent(),/menopause/);
 await page.getByLabel('搜索关键字').fill('睡眠');await page.getByLabel('关键字类型').selectOption('topic');await page.waitForTimeout(600);await page.locator('.keyword-table tbody tr').filter({has:page.getByText('睡眠',{exact:true})}).getByRole('button',{name:/件/}).click();await page.waitForSelector('tbody tr');assert.match(await page.locator('.section-title h2').textContent(),/睡眠关联商品/);await page.screenshot({path:path.join(out,'keyword-products.png'),fullPage:true});
 await page.locator('tbody tr .brand-cell').first().click();await page.getByRole('dialog',{name:'商品详情'}).waitFor();assert.ok(await page.getByText('关联功效关键字',{exact:true}).isVisible());await page.screenshot({path:path.join(out,'keyword-product-detail.png'),fullPage:true});await page.getByLabel('关闭详情').click();
 await page.locator('nav').getByRole('button',{name:'关键字',exact:true}).click();await page.waitForSelector('.keyword-table tbody tr');await page.getByRole('button',{name:'新增',exact:true}).click();const dialog=page.getByRole('dialog',{name:'关键字编辑'});await dialog.getByLabel('中文关键字',{exact:true}).fill('测试功效_'+Date.now());await dialog.getByLabel('英文关键字',{exact:true}).fill('test keyword fixture');await dialog.getByLabel('匹配别名').fill('fixture alias');const request=page.waitForResponse(r=>r.url().endsWith('/api/keywords')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'保存关键字',exact:true}).click();temporary=(await (await request).json()).id;await dialog.waitFor({state:'hidden'});
 const saved=(await api('/keywords?search=test keyword fixture')).rows[0];assert.equal(saved.id,temporary);assert.deepEqual(saved.aliases,['fixture alias']);
 await api('/keywords/'+temporary,'PATCH',{name_zh:saved.name_zh,name_en:saved.name_en,category:saved.category,aliases:saved.aliases,keyword_type:'topic',enabled:false});assert.equal((await api('/keywords?search=test keyword fixture&enabled=false')).total,1);await api('/keywords/'+temporary,'DELETE');temporary=null;
 await page.getByLabel('搜索关键字').fill('不存在的功效abcdef');await page.getByText('没有匹配的关键字',{exact:true}).waitFor();await page.getByLabel('搜索关键字').fill('');await page.waitForSelector('.keyword-table tbody tr');
 await page.getByRole('button',{name:'导出',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Excel 表格',exact:true}).click();await(await download).saveAs(path.join(out,'keywords-export.xlsx'));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'keywords-mobile.png'),fullPage:true});
 await page.getByLabel('导航菜单').click();await page.locator('nav').getByRole('button',{name:'站点库',exact:false}).click();await page.getByRole('button',{name:'创建采集任务',exact:true}).click();await page.getByRole('dialog',{name:'创建采集任务'}).waitFor();await page.locator('.site-picker label').first().waitFor();assert.equal(await page.locator('.site-picker label').count(),100);await page.getByRole('button',{name:'选择全部 100 站点',exact:true}).click();assert.equal(await page.locator('.site-picker input:checked').count(),100);await page.getByLabel('关闭任务窗口').click();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:'passed',keywords:2000,categories:20,linkedSleepProducts:p.total,allSitesJob:jobs[0].id,browserErrors:errors}));
}finally{if(temporary)await api('/keywords/'+temporary,'DELETE');await browser.close();}
