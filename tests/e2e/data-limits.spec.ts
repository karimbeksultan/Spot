import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

async function open(page:Page){await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('.nearby-place').first()).toBeVisible({timeout:30000});}
test('data and limitations are keyboard accessible and name real sources and gaps',async({page})=>{
  await open(page);const opener=page.getByRole('button',{name:'Данные и ограничения',exact:true});
  await opener.focus();await page.keyboard.press('Enter');
  const panel=page.getByRole('region',{name:'Данные и ограничения',exact:true});
  await expect(panel).toBeVisible();await expect(page.getByRole('heading',{name:'Данные и ограничения',exact:true})).toBeFocused();
  await expect(panel).toContainText('не является полным каталогом');await expect(panel).toContainText('Веса модели не обучались');
  await expect(panel).toContainText('неизвестная цена');await expect(panel).toContainText('трансфер в аэропорт');
  await expect(panel).toContainText('POST');await expect(panel).toContainText('не копируется в Spot');
  await expect(panel.getByRole('link',{name:'OpenStreetMap / ODbL'})).toHaveAttribute('href','https://www.openstreetmap.org/copyright');
  await expect(panel.getByRole('link',{name:'Wikimedia Commons',exact:true})).toHaveAttribute('rel','noopener noreferrer');
  const counts=await panel.locator('.data-counts dd').allTextContents();
  expect(counts.map(value=>value.replace(/\D/g,''))).toEqual(['2165','2170','5']);
});
test('the information section supports Kazakh and English without claiming full translation',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Данные и ограничения',exact:true}).click();
  await page.locator('#data-language').selectOption('kk');
  await expect(page.getByRole('heading',{name:'Деректер мен шектеулер',exact:true})).toBeVisible();
  await expect(page.locator('.data-limits')).toHaveAttribute('lang','kk');
  await expect(page.locator('.data-limits')).toContainText('қазақша мәтінді тіл маманы');
  await page.locator('#data-language').selectOption('en');
  await expect(page.getByRole('heading',{name:'Data and limitations',exact:true})).toBeVisible();
  await expect(page.locator('.data-limits')).toHaveAttribute('lang','en');
  await expect(page.locator('.data-limits')).toContainText('Model weights were not trained');
  await expect(page.locator('.data-limits')).toContainText('Wheelchair access counts only with confirmed evidence');
});
test('opening the information section preserves search state and returns focus to the query',async({page})=>{
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Моя прогулка на 45 минут');
  await page.getByRole('checkbox',{name:'Вернуться к старту',exact:true}).check();
  await page.getByRole('button',{name:'Данные и ограничения',exact:true}).click();
  await page.getByRole('button',{name:'К поиску',exact:true}).click();
  await expect(page.getByLabel('Ваши планы и пожелания')).toHaveValue('Моя прогулка на 45 минут');
  await expect(page.getByRole('checkbox',{name:'Вернуться к старту',exact:true})).toBeChecked();
  await expect(page.getByLabel('Ваши планы и пожелания')).toBeFocused();
});
for(const width of [1280,390])test(`data section fits ${width}px with reduced motion`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await open(page);
  await page.getByRole('button',{name:'Данные и ограничения',exact:true}).click();
  await expect(page.locator('.data-limits')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const nav=await page.locator('.main-nav').boundingBox();expect(nav!.x+nav!.width).toBeLessThanOrEqual(width);
  await mkdir('artifacts/verification/ui',{recursive:true});await page.screenshot({path:`artifacts/verification/ui/data-limits-${width}.png`});
  await page.locator('.data-limits>section').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.data-limits>section').last()).toBeVisible();
});
