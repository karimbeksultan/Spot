import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { interpretRequest, searchRequestSchema, type Poi, type SearchRequest, type SearchResponse } from '../../src/lib/types';

// Explicit UI fixtures use saved real POI records. They do not verify external APIs.
const source = JSON.parse(readFileSync('data/pois.json', 'utf8')) as Poi[];
const places = source.slice(0, 3);
function fixture(payload: unknown, options: { kind?: SearchResponse['kind']; title?: string } = {}): SearchResponse {
  const context = interpretRequest(searchRequestSchema.parse(payload));
  const kind = options.kind ?? 'recommendations';
  return {
    mode: 'demo', kind, resultKind: 'alternatives', context,
    items: kind === 'recommendations' ? [{ ...places[0], name: options.title ?? places[0].name,
      why: 'Тест интерфейса: запись реального POI.', idea: 'Идея для теста интерфейса.',
      visitMinutes: 10, evidenceIds: [places[0].evidence[0].id], distanceMetres: 100,
      openingStatus: 'unknown', warnings: [],
    }] : [],
    plan: { status: 'unverified', visitMinutes: kind === 'recommendations' ? 10 : 0,
      travelMinutes: null, reserveMinutes: 5, totalMinutes: null, warnings: [],
      returnToStart: context.returnToStart, legs: [] },
    warnings: [],
    diagnostics: { candidateCount: places.length, retrieval: 'snapshot-lexical', generation: 'template' },
    provenance: { dataSource: 'real_snapshot', retrieval: 'snapshot-lexical', generation: 'template', clock: '2026-10-18T08:00:00Z' },
    ...(kind === 'clarification' ? { clarification: { code: 'airport_transfer', question: 'Когда нужно прибыть в аэропорт и как вы туда доберётесь?', fields: ['airportDeadline', 'transport'] } } : {}),
  } as SearchResponse;
}
async function open(page: Page) {
  await page.route('**/api/pois', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().url()).not.toContain('latitude');
    expect(route.request().postDataJSON()).toMatchObject({ origin: { longitude: expect.any(Number), latitude: expect.any(Number) } });
    await route.fulfill({ json: { mode: 'snapshot', items: places, warnings: [] } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.nearby-place').first()).toBeVisible();
}
async function submit(page: Page) {
  await page.locator('.search-submit').click();
  await expect(page.locator('.results')).toBeVisible();
}

test('ordinary indoor follow-up preserves time, origin, return and prior context; chips are editable', async ({ page }) => {
  const requests: SearchRequest[] = [];
  await page.route('**/api/search', async route => {
    const payload = route.request().postDataJSON(); requests.push(payload);
    const result = fixture(payload);
    if (requests.length === 1) {
      result.context.interests = ['landmark'];
      result.context.maxDistanceMetres = 1200;
      result.context.excludedPoiIds = ['osm:test-excluded'];
    }
    await route.fulfill({ json: result });
  });
  await open(page);
  await page.getByRole('button', { name: /Прогулка у EXPO/ }).click();
  await submit(page);
  await page.getByLabel('Ваши планы и пожелания').fill('а теперь только внутри помещений');
  await submit(page);
  expect(requests[1]).toMatchObject({ origin: requests[0].origin, availableMinutes: 45, returnToStart: true,
    interests: ['landmark'], maxDistanceMetres: 1200, excludedPoiIds: ['osm:test-excluded'] });
  await expect(page.getByRole('button', { name: 'Убрать условие: В помещении' })).toBeVisible();
  await page.getByRole('button', { name: 'Убрать условие: В помещении' }).click();
  await expect(page.locator('.loading-state')).toBeHidden();
  expect(requests.at(-1)?.requiredFeatures).not.toContain('indoor');
  expect(requests.at(-1)?.query).not.toMatch(/только\s+внутри/);
  await page.getByRole('button', { name: 'Новый поиск', exact: true }).click();
  await expect(page.locator('.results')).toHaveCount(0);
  await expect(page.getByLabel('Ваши планы и пожелания')).toHaveValue('');
  await expect(page.getByLabel('Вернуться к старту')).not.toBeChecked();
});

test('airport clarification has a question and does not offer to relax filters', async ({ page }) => {
  await page.route('**/api/search', route => route.fulfill({ json: fixture(route.request().postDataJSON(), { kind: 'clarification' }) }));
  await open(page);
  await page.getByLabel('Ваши планы и пожелания').fill('У меня два часа до вылета');
  await submit(page);
  await expect(page.locator('.results')).toHaveAttribute('data-outcome', 'clarification');
  await expect(page.getByText('Нужно уточнение', { exact: true })).toBeVisible();
  await expect(page.locator('.clarification-state')).toContainText('Когда нужно прибыть в аэропорт');
  await expect(page.locator('.clarification-state')).toContainText('не обещает успеть на рейс');
  await expect(page.getByRole('button', { name: 'Посмотреть места без ограничений' })).toHaveCount(0);
  await expect(page.locator('.result-card')).toHaveCount(0);
});

test('strict budget stays explicit when prices are unknown', async ({ page }) => {
  const requests: SearchRequest[] = [];
  await page.route('**/api/search', route => {
    const payload = route.request().postDataJSON(); requests.push(payload);
    return route.fulfill({ json: fixture(payload, { kind: 'no_match' }) });
  });
  await open(page);
  await page.getByLabel('Ваши планы и пожелания').fill('Хочу кофе рядом');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByLabel('Бюджет, ₸', { exact: true }).fill('1000');
  await page.getByLabel('Строгий бюджет', { exact: true }).check();
  await submit(page);
  expect(requests[0]).toMatchObject({ budgetKzt: 1000, strictBudget: true });
  await expect(page.getByRole('button', { name: 'Убрать условие: Строгий бюджет' })).toContainText('1000 ₸');
  await expect(page.locator('.empty-state')).toContainText('Неизвестные цены');
  await expect(page.getByRole('button', { name: 'Посмотреть места без ограничений' })).toHaveCount(0);
});

test('late response after origin change cannot overwrite the current search', async ({ page }) => {
  let pending: (() => void) | undefined;
  let count = 0;
  await page.route('**/api/search', async route => {
    count++;
    const result = fixture(route.request().postDataJSON(), { title: count === 1 ? 'Устаревший результат' : 'Текущий результат' });
    if (count === 1) await new Promise<void>(resolve => { pending = resolve; });
    await route.fulfill({ json: result }).catch(() => {});
  });
  await open(page);
  await page.getByLabel('Ваши планы и пожелания').fill('Хочу прогулку');
  await page.locator('.search-submit').click();
  await expect(page.locator('.loading-state')).toBeVisible();
  await page.getByLabel('Откуда начнём').selectOption('0');
  await submit(page);
  await expect(page.locator('.result-card h3')).toHaveText('Текущий результат');
  pending?.();
  await page.waitForTimeout(250);
  await expect(page.locator('.result-card h3')).toHaveText('Текущий результат');
});

test('data origin and generation are distinct; primary actions support Kazakh and English', async ({ page }) => {
  const languages: string[] = [];
  await page.route('**/api/search', route => {
    languages.push(route.request().postDataJSON().language);
    return route.fulfill({ json: fixture(route.request().postDataJSON()) });
  });
  await open(page);
  await page.getByLabel('Ваши планы и пожелания').fill('Хочу прогулку');
  await submit(page);
  await expect(page.locator('.mode-label').first()).toContainText('Демо');
  await expect(page.locator('.provenance-labels')).toContainText('сохранённые реальные POI');
  await expect(page.locator('.provenance-labels')).toContainText('без генерации');
  await page.locator('#language').selectOption('kk');
  await expect(page.locator('.search-submit')).toHaveText('Орын табу');
  await page.getByLabel('Жоспарыңыз бен тілектеріңіз').fill('Жақын жерде серуен');
  await submit(page);
  await expect(page.locator('.translation-note')).toContainText('ішінара');
  await page.locator('#language').selectOption('en');
  await expect(page.locator('.search-submit')).toHaveText('Find a place');
  await page.getByLabel('Your plans and preferences').fill('A nearby walk');
  await submit(page);
  expect(languages).toEqual(['ru', 'kk', 'en']);
  await expect(page.locator('.provenance-labels')).toContainText('saved real OpenStreetMap');
});

test('Google Maps verification links only the public place and never loads Google automatically',async({page})=>{
  const googleRequests:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).hostname.endsWith('google.com'))googleRequests.push(request.url());});
  await open(page);
  await page.locator('.nearby-place').first().click();
  const link=page.getByRole('link',{name:'Проверить в Google Maps',exact:true});
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target','_blank');
  await expect(link).toHaveAttribute('rel','noopener noreferrer');
  const url=new URL((await link.getAttribute('href'))!);
  expect(url.origin+url.pathname).toBe('https://www.google.com/maps/search/');
  expect([...url.searchParams.keys()]).toEqual(['api','query']);
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('query')).toContain(places[0].name.slice(0,75));
  expect(url.searchParams.get('query')).toContain('Астана');
  expect(url.searchParams.get('query')).not.toContain('51.1061652');
  await expect(page.locator('.external-place-hint')).toContainText('не импортируются в Spot');
  expect(googleRequests).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`context and clarification fit ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/search', route => route.fulfill({ json: fixture(route.request().postDataJSON(), { kind: 'clarification' }) }));
    await open(page);
    if (viewport.width < 768) await page.getByRole('button', { name: 'Развернуть панель' }).click();
    await page.getByLabel('Ваши планы и пожелания').fill('У меня два часа до вылета');
    await submit(page);
    await page.locator('.clarification-state').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const panel = await page.locator('.sidebar').boundingBox();
    const question = await page.locator('.clarification-state').boundingBox();
    expect(question!.width).toBeLessThan(panel!.width);
    await mkdir('artifacts/verification/ui', { recursive: true });
    await page.screenshot({ path: `artifacts/verification/ui/clarification-${viewport.width}.png` });
  });
}
