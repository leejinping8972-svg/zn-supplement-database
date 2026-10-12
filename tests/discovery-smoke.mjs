import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/vanc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3210',out=path.resolve('test-artifacts');await fs.mkdir(out,{recursive:true});
const response=await fetch(base+'/api/discovery'),data=await response.json();assert.equal(response.status,200);assert.equal(data.settings.engine,'google');assert.equal(data.settings.pagesPerKeyword,3);
const job=data.jobs.find(j=>['waiting_for_config','running','queued'].includes(j.status));assert.ok(job);assert.equal(job.progress.total,6000);assert.equal(job.options,undefined);
assert.equal(JSON.stringify(data).includes('apiKey'),false);
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.waitForSelector('.site-table tbody tr');assert.equal(await page.title(),'ZN保健品数据库');assert.match(await page.locator('.brand').textContent(),/ZN保健品数据库/);assert.ok(await page.locator('.brand').isVisible());await page.screenshot({path:path.join(out,'zn-sites-desktop.png'),fullPage:true});
 await page.locator('nav').getByRole('button',{name:'搜索发现',exact:true}).click();await page.getByText('Google 搜索发现',{exact:true}).waitFor();await page.getByText('等待搜索接口',{exact:true}).first().waitFor();
 if(!data.settings.configured){assert.ok(await page.getByLabel('SerpAPI API Key').isVisible());assert.equal(await page.getByLabel('SerpAPI API Key').getAttribute('type'),'password');assert.ok(await page.getByRole('button',{name:'保存接口',exact:true}).isDisabled());}
 assert.ok(await page.getByText(/6,000 次搜索 API 请求/).isVisible());assert.equal(await page.locator('progress').getAttribute('max'),'6000');await page.screenshot({path:path.join(out,'google-discovery-desktop.png'),fullPage:true});
 await page.getByLabel('搜索发现结果').fill('menopause');await page.getByLabel('独立站判断结果').selectOption('independent');await page.waitForTimeout(400);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'google-discovery-mobile.png'),fullPage:true});
 await page.getByLabel('导航菜单').click();const brand=page.locator('.brand');assert.ok(await brand.isVisible());assert.equal(await brand.evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:path.join(out,'zn-sidebar-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:'passed',name:await page.title(),discoveryJob:job.id,searchPages:job.progress.total,configured:data.settings.configured,browserErrors:errors}));
}finally{await browser.close();}
