import { test, expect, type Page } from '@playwright/test';
import type { Poi } from '../../src/lib/types';

// Test-only API and image fixtures: no invented photos enter the POI dataset.
const photos = [1, 2, 3].map(number => ({
  url: `https://upload.wikimedia.org/spot-gallery-test/${number}.svg`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:Spot_gallery_test_${number}.svg`,
  author: `Тестовый автор ${number}`,
  license: number === 2 ? 'CC BY-SA 4.0' : 'CC BY 4.0',
  licenseUrl: number === 2 ? 'https://creativecommons.org/licenses/by-sa/4.0/' : 'https://creativecommons.org/licenses/by/4.0/',
  attribution: `Тестовый автор ${number}, тестовая фотография ${number}`,
}));

function place(id: string, name: string, placePhotos = photos): Poi {
  return {
    id, name, description: 'Место только для проверки интерфейса галереи.', category: 'park',
    location: { longitude: 71.4165705, latitude: 51.1061652 },
    features: { outlets: null, wheelchair: null, indoor: null, quiet: null },
    evidence: [{ id: `${id}-category`, poiId: id, field: 'category', value: 'park', sourceUrl: 'https://www.openstreetmap.org/', fetchedAt: '2026-10-16T00:00:00Z', confirmedAt: null }],
    hours: null, openingHours: null, address: null, photos: placePhotos,
    sourceUrl: 'https://www.openstreetmap.org/', fetchedAt: '2026-10-16T00:00:00Z', confirmedAt: null, contentHash: 'gallery-test',
  };
}

async function openGallery(page: Page, failed: number[] = []) {
  const requested: number[] = [];
  await page.route('**/api/pois', route => route.fulfill({
    json: { mode: 'snapshot', warnings: [], items: [place('gallery-test', 'Тестовый сад'), place('empty-test', 'Место без фото', [])] },
  }));
  await page.route('https://upload.wikimedia.org/spot-gallery-test/**', route => {
    const number = Number(route.request().url().match(/(\d)\.svg$/)?.[1]);
    requested.push(number);
    return failed.includes(number) ? route.abort() : route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="${['#678a72', '#a8c2af', '#3d6651'][number - 1]}"/><text x="360" y="240" text-anchor="middle" font-size="48" fill="white">Test photo ${number}</text></svg>`,
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.nearby-place').filter({ hasText: 'Тестовый сад' }).click();
  const gallery = page.getByRole('group', { name: 'Фотографии: Тестовый сад', exact: true });
  await expect(gallery).toBeVisible();
  return { gallery, requested };
}

test('photo controls change the image and its source, license and attribution', async ({ page }) => {
  const { gallery, requested } = await openGallery(page);
  await expect(gallery.locator('img')).toHaveAttribute('src', photos[0].url);
  await expect(gallery.locator('img')).toHaveClass('is-loaded');
  expect(await gallery.locator('img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
  await expect(gallery.getByRole('status')).toHaveText('Фото 1 из 3');
  expect(requested).not.toContain(2);
  expect(requested).not.toContain(3);
  await gallery.getByRole('button', { name: 'Следующее фото' }).click();
  await expect(gallery.locator('img')).toHaveAttribute('src', photos[1].url);
  await expect(gallery.locator('img')).toHaveClass('is-loaded');
  await expect(gallery.getByRole('status')).toHaveText('Фото 2 из 3');
  await expect(gallery.locator('.photo-author')).toHaveText(photos[1].attribution);
  await expect(gallery.getByRole('link', { name: 'Источник фото: Тестовый автор 2' })).toHaveAttribute('href', photos[1].sourceUrl);
  await expect(gallery.getByRole('link', { name: 'Лицензия фото: CC BY-SA 4.0' })).toHaveAttribute('href', photos[1].licenseUrl);
  await gallery.getByRole('button', { name: 'Предыдущее фото' }).click();
  await expect(gallery.locator('img')).toHaveAttribute('src', photos[0].url);
});

test('gallery keyboard navigation wraps and preserves focused control', async ({ page }) => {
  const { gallery } = await openGallery(page);
  const next = gallery.getByRole('button', { name: 'Следующее фото' });
  await next.focus();
  await page.keyboard.press('End');
  await expect(gallery.getByRole('status')).toHaveText('Фото 3 из 3');
  await page.keyboard.press('ArrowRight');
  await expect(gallery.getByRole('status')).toHaveText('Фото 1 из 3');
  await page.keyboard.press('ArrowLeft');
  await expect(gallery.getByRole('status')).toHaveText('Фото 3 из 3');
  await page.keyboard.press('Home');
  await expect(gallery.getByRole('status')).toHaveText('Фото 1 из 3');
  await expect(next).toBeFocused();
});

test('a broken photograph is skipped and attribution follows the usable photograph', async ({ page }) => {
  const { gallery } = await openGallery(page, [1]);
  await expect(gallery.locator('img')).toHaveAttribute('src', photos[1].url);
  await expect(gallery.locator('img')).toHaveClass('is-loaded');
  await expect(gallery.getByRole('status')).toHaveText('Фото 1 из 2');
  await expect(gallery.locator('.photo-author')).toHaveText(photos[1].attribution);
  await gallery.getByRole('button', { name: 'Следующее фото' }).click();
  await expect(gallery.locator('img')).toHaveAttribute('src', photos[2].url);
  await expect(gallery.getByRole('status')).toHaveText('Фото 2 из 2');
});

test('unavailable photos and an empty gallery have distinct honest placeholders', async ({ page }) => {
  const { gallery } = await openGallery(page, [1, 2, 3]);
  await expect(gallery.locator('.photo-missing')).toContainText('Фото не загрузились');
  await expect(gallery.locator('img')).toHaveCount(0);
  await expect(gallery.getByRole('button')).toHaveCount(0);
  await expect(gallery.locator('.gallery-credit')).toHaveCount(0);
  await page.getByRole('button', { name: 'К местам', exact: true }).click();
  await page.locator('.nearby-place').filter({ hasText: 'Место без фото' }).click();
  await expect(page.locator('.place-gallery .photo-missing')).toContainText('Фото пока нет');
});

test('mobile gallery has touch-sized controls and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { gallery } = await openGallery(page);
  const next = gallery.getByRole('button', { name: 'Следующее фото' });
  const bounds = await next.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(gallery.getByRole('status')).toHaveText('Фото 2 из 3');
  expect(await gallery.locator('img').evaluate(image => getComputedStyle(image).transitionDuration)).toBe('0s');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
