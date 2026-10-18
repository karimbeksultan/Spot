import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run against an actual local production server with Supabase and Ollama enabled.
const base = process.env.SPOT_BASE_URL || 'http://127.0.0.1:3000';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
const browser = await chromium.launch({ executablePath: process.env.SPOT_BROWSER_PATH || undefined, headless:true, args:['--enable-unsafe-swiftshader'] });
const errors=[];
try {
  const page = await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.nearby-place').first().waitFor({timeout:30000});
  await page.getByLabel('Ваши планы и пожелания').fill('Хочу провести немного времени среди деревьев, без кафе');
  const started=Date.now();
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/search') && r.request().method()==='POST',{timeout:180000});
  await page.getByRole('button',{name:'Найти своё место'}).click();
  const response=await pending;
  assert.equal(response.status(),200);
  const data=await response.json();
  const latencyMs=Date.now()-started;
  assert.equal(data.mode,'live');
  assert.equal(data.diagnostics.retrieval,'supabase-hybrid');
  assert.equal(data.diagnostics.generation,'ollama-validated');
  assert(data.items.length>=1 && data.items.length<=3);
  assert(data.items.every(p=>p.category!=='cafe' && p.evidenceIds.length));
  assert(data.context.excludedCategories.includes('cafe'));
  await page.locator('.result-card').first().waitFor();
  await page.locator('.results').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await mkdir('docs/screenshots',{recursive:true});
  await page.screenshot({path:'docs/screenshots/desktop-live-results.png'});
  await page.getByRole('button',{name:'Посмотреть план',exact:true}).click();
  await page.locator('.sidebar-scroll').evaluate(element=>element.scrollTop=0);
  await page.waitForTimeout(1800);
  await page.screenshot({path:'docs/screenshots/desktop-live-plan.png'});
  assert.deepEqual(errors,[]);
  const report={testedAt:new Date().toISOString(),status:'passed',query:'Хочу провести немного времени среди деревьев, без кафе',latencyMs,mode:data.mode,diagnostics:data.diagnostics,poiIds:data.items.map(p=>p.id),planStatus:data.plan.status,totalMinutes:data.plan.totalMinutes,consoleErrors:errors,note:'Actual Chromium UI → production Next.js → local Ollama → authorized Spot Supabase. No mocked responses.'};
  await writeFile('data/reports/live-browser.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
