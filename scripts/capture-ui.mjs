import {chromium} from '@playwright/test';
import fs from 'node:fs';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.SPOT_BROWSER_PATH?{executablePath:process.env.SPOT_BROWSER_PATH}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const consoleErrors=[]; page.on('pageerror',e=>consoleErrors.push(e.message));
 await page.goto(process.env.SPOT_BASE_URL || 'http://127.0.0.1:3000',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('.nearby-place');await page.waitForTimeout(1500);
 fs.mkdirSync('docs/screenshots',{recursive:true});
 await page.screenshot({path:'docs/screenshots/desktop-start.png'});
 console.log(JSON.stringify({title:await page.title(),places:await page.locator('.nearby-place').count(),markers:await page.locator('.poi-marker').count(),consoleErrors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
