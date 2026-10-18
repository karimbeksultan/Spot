import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, sha256, sourceRetryDelay } from '../../scripts/data/common';
import { planImport, provenanceFor, stablePayloadDigest, validateImport } from '../../scripts/data/import-plan';
import { normalize, type OsmElement } from '../../scripts/data/normalize';

const fetchedAt = '2026-10-16T10:00:00Z';
const element: OsmElement = { type: 'node', id: 4200, lat: 51.1, lon: 71.4,
  tags: { name: 'Fixture cafe', 'name:ru': 'Тестовое кафе', 'name:kk': 'Сынақ кафе', 'name:en': 'Fixture cafe', amenity: 'cafe', alt_name: 'Тест; Сынақ' } };
const poi = () => normalize([element], fetchedAt).pois[0];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('non-destructive import plan and provenance', () => {
  it('repeats stable source IDs without inserts or duplicate records', () => {
    const first = planImport([poi()], []);
    const second = planImport([poi()], first.pois);
    expect(first.counts.inserted).toBe(1);
    expect(second.counts).toEqual({ inserted: 0, updated: 0, unchanged: 1, retainedAbsent: 0, deleted: 0 });
    expect(first.outputDigest).toBe(second.outputDigest);
  });
  it('does not turn a partial or empty response into deletions', () => {
    const existing = [poi(), { ...poi(), id: 'osm:node/4201', sourceUrl: 'https://www.openstreetmap.org/node/4201' }];
    const partial = planImport([poi()], existing);
    expect(partial.pois).toHaveLength(2);
    expect(partial.retainedIds).toEqual(['osm:node/4201']);
    expect(planImport([], existing).counts).toMatchObject({ retainedAbsent: 2, deleted: 0 });
  });
  it('ignores fetch time changes but detects actual payload/photo changes', () => {
    const first = poi();
    const replay = normalize([element], '2026-10-18T10:00:00Z').pois[0];
    expect(stablePayloadDigest(first)).toBe(stablePayloadDigest(replay));
    expect(stablePayloadDigest({ ...first, address: 'Новое значение' })).not.toBe(stablePayloadDigest(first));
    expect(stablePayloadDigest({ ...first, photos: [{ url: 'https://upload.wikimedia.org/test.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg', author: 'Test', license: 'CC0', attribution: 'Test' }] })).not.toBe(stablePayloadDigest(first));
  });
  it('rejects duplicate payload IDs and forged source identity before persistence', () => {
    expect(() => planImport([poi(), poi()], [])).toThrow('Duplicate ID');
    expect(validateImport([{ ...poi(), sourceUrl: 'https://example.org/other' }])).toContain('OSM source identity invalid: osm:node/4200');
  });
  it('rejects unsupported OSM object types and invalid check dates', () => {
    expect(normalize([{ ...element, type: 'arbitrary-path' }], fetchedAt).pois).toHaveLength(0);
    expect(normalize([{ ...element, tags: { ...element.tags, check_date: '2026-02-30' } }], fetchedAt).pois[0].confirmedAt).toBeNull();
  });
  it('keeps source modification, fetch and human confirmation times distinct', () => {
    const source = { ...element, timestamp: '2026-09-01T12:00:00Z' };
    const [record] = provenanceFor([source], [poi()], fetchedAt);
    expect(record).toMatchObject({ fetchedAt, sourceUpdatedAt: source.timestamp, independentlyConfirmedAt: null,
      attribution: '© OpenStreetMap contributors', license: 'ODbL 1.0', descriptionOrigin: 'derived_from_source_tags' });
    expect(record.names).toMatchObject({ 'name:ru': 'Тестовое кафе', 'name:kk': 'Сынақ кафе' });
    expect(record.aliases).toEqual(['Тест', 'Сынақ']);
    expect(record.tags.amenity).toBe('cafe');
    expect(record.quality.independentlyConfirmed).toBe(false);
  });
  it('marks unknown source-update time and centre coordinates honestly', () => {
    const [record] = provenanceFor([{ ...element, lat: undefined, lon: undefined, center: { lat: 51.1, lon: 71.4 } }], [poi()], fetchedAt);
    expect(record).toMatchObject({ sourceUpdatedAt: null, coordinateMethod: 'source_object_center' });
  });
  it('snapshot dry-runs do not fetch, write files, require keys or call embedding models', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'spot-import-contract-'));
    try {
      await mkdir(path.join(directory, 'data/raw'), { recursive: true });
      const existing = poi();
      await writeFile(path.join(directory, 'data/pois.json'), JSON.stringify([existing]));
      await writeFile(path.join(directory, 'data/raw/overpass.json'), JSON.stringify({ fetchedAt, responses: [{ elements: [element] }] }));
      const guard = path.join(directory, 'offline.mjs');
      await writeFile(guard, "globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN_IN_SNAPSHOT_DRY_RUN'); };\n");
      const before = sha256(await readFile(path.join(directory, 'data/pois.json')));
      const filesBefore = await readdir(path.join(directory, 'data'), { recursive: true });
      const root = process.cwd();
      const cli = path.join(root, 'node_modules/tsx/dist/cli.mjs');
      const environment = { ...process.env, SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
        OLLAMA_BASE_URL: 'http://127.0.0.1:1', OLLAMA_EMBED_MODEL: 'embeddinggemma', EMBEDDING_DIMENSIONS: '768', EMBEDDING_VERSION: '1',
        NODE_OPTIONS: `--import=${pathToFileURL(guard).href}` };
      for (const [file, args] of [['collect.ts', ['--from-snapshot', '--dry-run']], ['upsert.ts', ['--dry-run']], ['embed.ts', ['--dry-run']], ['provenance.ts', ['--dry-run']]] as const) {
        const result = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, cli, path.join(root, 'scripts/data', file), ...args], { cwd: directory, env: environment, encoding: 'utf8', timeout: 15_000, windowsHide: true });
        expect(result.error, file).toBeUndefined();
        expect(result.status, `${file}: ${result.stderr}`).toBe(0);
        expect(JSON.parse(result.stdout).dryRun).toBe(true);
      }
      expect(sha256(await readFile(path.join(directory, 'data/pois.json')))).toBe(before);
      expect(await readdir(path.join(directory, 'data'), { recursive: true })).toEqual(filesBefore);
    } finally {
      if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(directory).startsWith('spot-import-contract-')) throw new Error('Unsafe test cleanup target');
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('bounded public-source retries', () => {
  it('does not retry terminal authentication/client errors', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', request);
    await expect(fetchJson('https://example.org/source')).rejects.toThrow('HTTP 403');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('honours Retry-After and the Overpass 30-second rate-limit pause', () => {
    expect(sourceRetryDelay(429, '7', 'https://commons.wikimedia.org/w/api.php', 0)).toBe(7000);
    expect(sourceRetryDelay(429, '1', 'https://overpass-api.de/api/interpreter', 0)).toBe(30000);
    expect(sourceRetryDelay(406, null, 'https://overpass-api.de/api/interpreter', 0)).toBe(30000);
    expect(sourceRetryDelay(429, '120', 'https://overpass-api.de/api/interpreter', 0)).toBeNull();
    expect(sourceRetryDelay(401, null, 'https://example.org/source', 0)).toBeNull();
  });
  it('retries a temporary response within the bounded backoff', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', request);
    const result = fetchJson('https://example.org/source');
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('stops network failures after three attempts', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(new TypeError('unavailable'));
    vi.stubGlobal('fetch', request);
    const result = fetchJson('https://example.org/source').catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(12000);
    expect(await result).toBe('unavailable');
    expect(request).toHaveBeenCalledTimes(3);
  });
});
