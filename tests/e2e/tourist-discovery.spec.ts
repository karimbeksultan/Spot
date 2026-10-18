import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { searchRequestSchema, type Poi, type SearchResponse } from '../../src/lib/types';

// Explicit UI fixtures over saved POIs. This does not test actual Qwen interpretation.
const source = JSON.parse(readFileSync('data/pois.json', 'utf8')) as Poi[];
const options = source.filter(poi => poi.category === 'cafe').slice(0, 3);
test('discovery is shown as independent options instead of an incomplete mandatory itinerary', async ({ page }) => {
  await page.route('**/api/pois', route => route.fulfill({ json: { mode: 'snapshot', items: options, warnings: [] } }));
  await page.route('**/api/search', route => {
    const context = searchRequestSchema.parse({ ...route.request().postDataJSON(), searchMode: 'discovery',
      journeyStages: [{ kind: 'cafe', cuisines: [] }] });
    const result: SearchResponse = { context, mode: 'live', kind: 'recommendations', resultKind: 'alternatives',
      items: options.map(poi => ({ ...poi, why: 'Explicit UI fixture.', idea: 'Choose one option.', visitMinutes: 8,
        evidenceIds: [poi.evidence[0].id], distanceMetres: 100, openingStatus: 'unknown', warnings: [] })),
      plan: { status: 'unverified', visitMinutes: 0, travelMinutes: null, reserveMinutes: 5, totalMinutes: null, returnToStart: false, legs: [], warnings: [] },
      warnings: [], provenance: { dataSource: 'real_snapshot', retrieval: 'local-hybrid', generation: 'ollama-validated', clock: '2026-10-19T07:00:00Z' },
      diagnostics: { candidateCount: 3, retrieval: 'local-hybrid', generation: 'ollama-validated', understanding: 'explicit-ui-fixture' } };
    return route.fulfill({ json: result });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.nearby-place').first()).toBeVisible();
  await page.getByLabel('Ваши планы и пожелания').fill('Где выпить кофе?');
  await page.locator('.search-submit').click();
  await expect(page.locator('.result-card')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Обязательные этапы', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Посмотреть план', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Выберите одно место', exact: true })).toBeVisible();
  await expect(page.locator('.alternative-place')).toHaveCount(3);
  await expect(page.locator('.itinerary-stop')).toHaveCount(0);
  await expect(page.locator('.plan-summary')).toHaveCount(0);
});
