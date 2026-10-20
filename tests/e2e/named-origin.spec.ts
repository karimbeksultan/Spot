import { test, expect } from '@playwright/test';

// Real snapshot and demo pipeline. This suite does not evaluate Qwen quality.
const query='нахожусь около Астана балет хочу поесть где нибудь есть 45 минут';
const ballet={longitude:71.4196527,latitude:51.0992346};
const garden={longitude:71.4165705,latitude:51.1061652};

test('confirmed named start retains the original query, planned time, return and 45-minute budget',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Ваши планы и пожелания').fill(query);
  await page.locator('#start-mode').selectOption('planned');
  await page.locator('#planned-start').fill('2026-10-18T12:00');
  await page.locator('.filter-row input[type=checkbox]').check();
  const first=page.waitForResponse(response=>response.url().endsWith('/api/search')&&response.request().method()==='POST');
  await page.locator('.search-submit').click();
  const clarification=await (await first).json();
  expect(clarification.clarification.code).toBe('origin_confirmation');
  expect(clarification.diagnostics.generation).toBe('not_run');
  expect(clarification.context.origin).toEqual(garden);
  const confirmation=page.getByRole('button',{name:'Начать здесь: Астана балет',exact:true});
  await expect(confirmation).toBeVisible();
  const second=page.waitForResponse(response=>response.url().endsWith('/api/search')&&response.request().method()==='POST');
  await confirmation.focus(); await confirmation.press('Enter');
  const response=await second;
  const sent=response.request().postDataJSON();
  expect(sent).toMatchObject({query,origin:ballet,availableMinutes:45,returnToStart:true,originChoice:{poiId:'osm:way/499328449',useAsStart:true}});
  const result=await response.json();
  expect(result.context).toMatchObject({query,origin:ballet,availableMinutes:45,returnToStart:true,startTime:'2026-10-18T12:00:00+05:00'});
  expect(Date.parse(result.context.startTime)).toBe(Date.parse('2026-10-18T07:00:00.000Z'));
  expect(result.clarification?.code).not.toBe('origin_confirmation');
  await expect(page.locator('#start')).toHaveValue('-1');
  await expect(page.locator('#start option:checked')).toHaveText('Астана балет');
  await expect(page.getByLabel('Ваши планы и пожелания')).toHaveValue(query);
});

test('mobile user can retain the selected start instead of accepting a named reference',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Ваши планы и пожелания').fill(query);
  await page.locator('.search-submit').click();
  const keep=page.getByRole('button',{name:'Оставить выбранный старт',exact:true});
  await expect(keep).toBeVisible();
  const box=await keep.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/search')&&response.request().method()==='POST');
  await keep.click();
  const response=await pending;
  expect(response.request().postDataJSON()).toMatchObject({query,origin:garden,availableMinutes:45,originChoice:{poiId:'osm:way/499328449',useAsStart:false}});
  expect((await response.json()).context.origin).toEqual(garden);
  await expect(page.locator('#start')).toHaveValue('2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('unknown named start does not silently calculate from the default garden',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Ваши планы и пожелания').fill('Я у неизвестного театра хочу поесть');
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/search')&&response.request().method()==='POST');
  await page.locator('.search-submit').click();
  const result=await (await pending).json();
  expect(result.clarification.code).toBe('origin_not_found');
  expect(result.items).toEqual([]); expect(result.diagnostics.generation).toBe('not_run');
  await expect(page.locator('.clarification-state')).toContainText('Координаты не подставлялись');
});

test('confirmation uses edits made after the question rather than stale response constraints',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Ваши планы и пожелания').fill(query);
  await page.locator('.search-submit').click();
  const confirmation=page.getByRole('button',{name:'Начать здесь: Астана балет',exact:true});
  await expect(confirmation).toBeVisible();
  const edited=query+' нужна розетка';
  await page.getByLabel('Ваши планы и пожелания').fill(edited);
  await page.locator('.filter-row input[type=checkbox]').check();
  await page.locator('.filter-button').click();
  await page.locator('.advanced-filters input[type=checkbox]').first().check();
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/search')&&response.request().method()==='POST');
  await confirmation.click();
  const response=await pending;
  expect(response.request().postDataJSON()).toMatchObject({query:edited,origin:ballet,availableMinutes:45,returnToStart:true,requiredFeatures:['outlets']});
  expect((await response.json()).context).toMatchObject({query:edited,returnToStart:true,requiredFeatures:['outlets']});
});
