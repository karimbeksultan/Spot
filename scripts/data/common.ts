import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import type { Poi } from '../../src/lib/types';

try { loadEnvFile('.env.local'); } catch { /* Environment-only execution is supported. */ }
export const dataDir = resolve(process.cwd(), 'data');
export const sha256 = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export async function readJson<T>(path: string): Promise<T> { return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) as T; }
export async function writeJson(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
export function plainText(value: string): string { return value.replace(/<[^>]*>/g, '').replace(/&(?:quot|#34);/g, '"').replace(/&amp;/g, '&').trim(); }
/** Bounded public-source retries; terminal HTTP responses never enter the network-error retry path. */
export function sourceRetryDelay(status: number, retryAfter: string | null, url: string, attempt: number, now = Date.now()): number | null {
  const overpass = ['overpass-api.de', 'overpass.private.coffee', 'maps.mail.ru'].includes(new URL(url).hostname);
  if (![429, 500, 502, 503, 504].includes(status) && !(overpass && status === 406)) return null;
  const parsed = retryAfter === null ? NaN : /^\d+(?:\.\d+)?$/.test(retryAfter.trim())
    ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now;
  // Do not violate a longer server cooldown just to fit this small CLI's retry limit.
  if (Number.isFinite(parsed) && parsed > 60_000) return null;
  return Math.max(4_000 * (2 ** attempt), overpass && [406, 429].includes(status) ? 30_000 : 0,
    Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
}
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 45_000): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      const deadline = AbortSignal.timeout(timeoutMs);
      response = await fetch(url, { ...init, headers: { 'User-Agent': 'SpotLocalPrototype/0.1 (research POI collection)', ...init.headers },
        signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
    } catch (error) {
      if (attempt === 2 || init.signal?.aborted) throw error;
      await new Promise(r => setTimeout(r, 4_000 * (2 ** attempt)));
      continue;
    }
    if (response.ok) return await response.json() as T;
    const delay = sourceRetryDelay(response.status, response.headers.get('Retry-After'), url, attempt);
    // Release the response before waiting; a failed body is not POI data.
    await response.body?.cancel();
    if (delay === null || attempt === 2) throw new Error(`Source returned HTTP ${response.status}`);
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Source request failed');
}
export function documentFor(poi: Poi): string {
  return [poi.name, poi.description, poi.category, poi.address, poi.openingHours ? `Часы по источнику: ${poi.openingHours}` : null,
    ...Object.entries(poi.features).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join('. ');
}
export function validatePois(pois: Poi[]): string[] {
  const errors: string[] = []; const ids = new Set<string>();
  for (const p of pois) {
    if (ids.has(p.id)) errors.push(`Duplicate ID ${p.id}`); ids.add(p.id);
    if (!p.id || !p.name || !p.description) errors.push(`Missing required field: ${p.id}`);
    if (!Number.isFinite(p.location.longitude) || !Number.isFinite(p.location.latitude) || p.location.longitude < 71.2 || p.location.longitude > 71.7 || p.location.latitude < 50.9 || p.location.latitude > 51.3) errors.push(`Outside Astana bounds: ${p.id}`);
    if (!p.evidence.some(e => e.field === 'category' && e.poiId === p.id)) errors.push(`Missing category evidence: ${p.id}`);
    for (const e of p.evidence) if (e.poiId !== p.id || !e.id || !e.sourceUrl.startsWith('https://')) errors.push(`Invalid evidence: ${p.id}`);
    for (const photo of p.photos) if (!photo.author || !photo.license || !photo.sourceUrl.startsWith('https://commons.wikimedia.org/')) errors.push(`Photo attribution missing: ${p.id}`);
    for (const [key, value] of Object.entries(p.features)) if (value !== null && typeof value !== 'boolean') errors.push(`Invalid tri-state ${key}: ${p.id}`);
  }
  return errors;
}
export async function loadPois(): Promise<Poi[]> { const pois = await readJson<Poi[]>(resolve(dataDir, 'pois.json')); const errors = validatePois(pois); if (errors.length) throw new Error(errors.join('\n')); return pois; }
export function ingestionTarget(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) locally; never commit them.');
  const host = new URL(url).hostname;
  const target = new URL(url);
  if (target.username || target.password || (!['localhost', '127.0.0.1', '[::1]'].includes(host) && target.protocol !== 'https:')) throw new Error('Remote ingestion requires HTTPS without URL credentials.');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && process.env.SPOT_APPROVED_DATABASE_HOST !== host) throw new Error('Remote writes disabled. After explicit approval for this database, set SPOT_APPROVED_DATABASE_HOST to its exact hostname.');
  return { url, key };
}
