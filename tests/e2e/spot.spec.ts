import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

async function open(page:Page){await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('.nearby-place').first()).toBeVisible({timeout:30000});}
async function submit(page:Page){await page.getByRole('button',{name:'Найти своё место'}).click();await expect(page.locator('.results')).toBeVisible({timeout:45000});}
test('app opens, map marker selects correct place and photo',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await expect(page).toHaveTitle(/spot/);await expect(page.locator('.poi-marker').first()).toBeVisible({timeout:20000});
  const marker=page.getByRole('button',{name:'Показать Ботанический сад',exact:true});await marker.click();
  await expect(page.locator('.place-detail h1')).toHaveText('Ботанический сад');
  await expect(page.locator('.place-detail img')).toHaveAttribute('alt','Ботанический сад');
  await expect(marker).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Источники и сведения'}).click();await expect(page.getByText('Открыть запись POI')).toHaveAttribute('href',/openstreetmap.org/);
  expect(errors).toEqual([]);
});
test('editable Mega walk scenario has return and real or explicitly unverified route',async({page})=>{
 await open(page);await page.getByRole('button',{name:/Прогулка у EXPO/}).click();
 await expect(page.getByLabel('Ваши планы и пожелания')).toHaveValue(/45 минут/);await submit(page);
 await expect(page.locator('.result-card').first()).toBeVisible();await expect(page.getByRole('checkbox',{name:'Вернуться к старту',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Посмотреть план',exact:true}).click();await expect(page.locator('.plan-view')).toBeVisible();await expect(page.locator('.plan-view')).toContainText('Вернуться к старту');
 await expect(page.locator('.plan-notice')).toContainText(/расчёту|не подтвержд[её]н|превышает/);
});
test('required outlet unknown gives empty state without silently relaxing',async({page})=>{
 await open(page);await page.getByRole('button',{name:/Кофе и розетка/}).click();await submit(page);
 await expect(page.getByText('Не нашли точного совпадения')).toBeVisible();await expect(page.getByText('Розетка обязательна',{exact:true})).toBeVisible();await expect(page.locator('.result-card')).toHaveCount(0);
});
test('child scenario, changing time and replacing place preserve hard conditions',async({page})=>{
 await open(page);await page.getByRole('button',{name:/С ребёнком/}).click();await submit(page);
 await expect(page.locator('.result-card').first()).toBeVisible();const before=await page.locator('.result-card h3').allTextContents();
 await page.getByRole('button',{name:'30 мин',exact:true}).click();await expect(page.locator('.loading-state')).toBeHidden({timeout:45000});
 const after=await page.locator('.result-card h3').allTextContents();expect(after.length).toBeLessThanOrEqual(1);expect(before.length).toBeGreaterThanOrEqual(after.length);
 await expect(page.getByLabel('Ваши планы и пожелания')).toHaveValue(/30 минут/);
 if(after.length){await page.locator('.result-actions button').filter({hasText:'Заменить'}).first().click();await expect(page.locator('.loading-state')).toBeHidden({timeout:45000});expect(await page.locator('.result-card h3').allTextContents()).not.toContain(after[0]);await expect(page.getByRole('button',{name:'30 мин',exact:true})).toHaveAttribute('aria-pressed','true');}
});
test('geolocation denial leaves manual start and useful feedback',async({page})=>{
 await page.addInitScript(()=>{navigator.geolocation.getCurrentPosition=(_success,error)=>error?.({code:1,message:'denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});});
 await open(page);await page.getByRole('button',{name:'Где я',exact:true}).click();await expect(page.getByRole('status')).toContainText('Доступ к геолокации не получен');await expect(page.getByLabel('Откуда начнём')).toBeEnabled();
});
test('unavailable model is labelled and does not break results',async({page})=>{
 await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Хочу прогуляться по парку');await submit(page);
 await expect(page.getByText('Резервный поиск без генерации',{exact:true})).toBeVisible();await expect(page.locator('.result-card').first()).toBeVisible();
});
test('broken image uses honest placeholder',async({page})=>{
 await page.route(/https:\/\/(?:upload|thumb)\.wikimedia\.org\//,route=>route.abort());await open(page);await page.getByRole('button',{name:'Показать Ботанический сад',exact:true}).click();await expect(page.locator('.place-photo.large .photo-missing')).toContainText('Фото не загрузились');
});
test('unknown request returns empty state, not unrelated recommendations',async({page})=>{
 await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Космодром с запуском ракеты');await submit(page);await expect(page.locator('.result-card')).toHaveCount(0);await expect(page.getByRole('button',{name:'Посмотреть места без ограничений'})).toBeVisible();
});
test('API error has retry; retry succeeds',async({page})=>{
 await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Хочу прогуляться');await page.route('**/api/search',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Тестовый сбой сети'})}),{times:1});
 await page.getByRole('button',{name:'Найти своё место'}).click();await expect(page.locator('.error-state[role="alert"]')).toContainText('Тестовый сбой сети');await page.getByRole('button',{name:'Попробовать ещё раз'}).click();await expect(page.locator('.results')).toBeVisible({timeout:45000});
});
test('privacy dialog closes with Escape and restores focus',async({page})=>{
 await open(page);const opener=page.getByRole('button',{name:'О сервисе и приватности'});await opener.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();await expect(opener).toBeFocused();
 expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});
for(const size of [{width:1366,height:768,label:'desktop'},{width:390,height:844,label:'mobile'}]){
 test(`visual states ${size.label}`,async({page})=>{
  await mkdir('artifacts/verification/ui',{recursive:true});await page.setViewportSize(size);await open(page);await page.waitForTimeout(1200);
  const capture=async(state:string)=>{await page.waitForTimeout(1500);await page.screenshot({path:`artifacts/verification/ui/${size.label}-${state}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);};
  await capture('start');
  if(size.label==='mobile')await page.getByRole('button',{name:'Развернуть панель'}).click();
  await page.getByLabel('Ваши планы и пожелания').fill('Хочу прогуляться по парку');await submit(page);await page.locator('.results').scrollIntoViewIfNeeded();await capture('results');
  await page.locator('.result-actions').first().getByRole('button',{name:'Подробнее'}).click();await capture('details');
  if(size.label==='mobile'){const marker=await page.locator('.poi-marker.selected').boundingBox();const sheet=await page.locator('.sidebar').boundingBox();expect(marker).not.toBeNull();expect(sheet).not.toBeNull();expect(marker!.y+marker!.height).toBeLessThanOrEqual(sheet!.y);expect(marker!.y).toBeGreaterThanOrEqual(65);}
  await page.getByRole('button',{name:'К местам',exact:true}).click();await page.getByRole('button',{name:'Посмотреть план',exact:true}).click();await capture('plan');
  await page.getByRole('button',{name:'Исследовать',exact:true}).click();await page.getByLabel('Ваши планы и пожелания').fill('Космодром с запуском ракеты');await submit(page);await page.locator('.results').scrollIntoViewIfNeeded();await capture('empty');
  await page.getByLabel('Ваши планы и пожелания').fill('Парк');await page.route('**/api/search',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Тестовый сбой API"}'}),{times:1});await page.getByRole('button',{name:'Найти своё место'}).click();await expect(page.locator('.error-state[role="alert"]')).toBeVisible();await capture('error');
 });
}
