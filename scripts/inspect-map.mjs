import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:process.env.SPOT_BROWSER_PATH,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push({url:r.url(),failure:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)errors.push({status:r.status(),url:r.url()});});
await page.goto('http://127.0.0.1:3000',{waitUntil:'domcontentloaded'});await page.waitForTimeout(10000);
console.log(JSON.stringify({errors,dom:await page.evaluate(()=>['.map-canvas','.maplibregl-canvas','.poi-marker','.maplibregl-marker'].map(s=>{const e=document.querySelector(s);const r=e?.getBoundingClientRect();return {s,rect:r?.toJSON(),style:e?.getAttribute('style'),html:e?.outerHTML.slice(0,500)}}))}));
await page.screenshot({path:'docs/screenshots/desktop-map-diagnostic.png'});await browser.close();
