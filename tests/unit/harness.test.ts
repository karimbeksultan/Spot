import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRevision, includeInRevision, manifestDigest, offlineEnvironment, sanitizeLog } from '../../scripts/harness/evidence.mjs';
import { runCheck } from '../../scripts/harness/runner.mjs';

const temporaryRoots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryRoots.splice(0)) {
    const absolute = resolve(directory);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.includes('spot-harness-test-')) throw new Error('Unexpected temporary path');
    rmSync(absolute, { recursive: true, force: true });
  }
});

describe('verification evidence and no-spend boundary', () => {
  it('never hashes secret env files or generated self-referencing evidence', () => {
    for (const path of ['.env.local', '.env', 'nested/.env.production', 'artifacts/verification/report.json', 'work/check.log', '.next/build.js', 'data/reports/quality.json', 'docs/PROGRESS.md', 'docs/spot-pitch.pptx']) expect(includeInRevision(path)).toBe(false);
    for (const path of ['.env.example', 'src/lib/model.ts', 'data/pois.json', 'tests/eval/acceptance.json', 'package-lock.json']) expect(includeInRevision(path)).toBe(true);
  });
  it('binds the report to actual file contents regardless of discovery order', () => {
    const first = [{ path: 'a.ts', sha256: 'first' }, { path: 'b.ts', sha256: 'second' }];
    expect(manifestDigest(first)).toBe(manifestDigest([...first].reverse()));
    expect(manifestDigest(first)).not.toBe(manifestDigest([{ ...first[0], sha256: 'changed' }, first[1]]));
  });
  it('still hashes real source inputs in a submitted archive without Git metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spot-harness-test-')); temporaryRoots.push(directory);
    mkdirSync(join(directory, 'src')); mkdirSync(join(directory, 'artifacts'));
    writeFileSync(join(directory, 'src/app.ts'), 'export const version = 1;');
    writeFileSync(join(directory, '.env.local'), 'SYNTHETIC_SECRET=not-for-manifest');
    writeFileSync(join(directory, 'artifacts/report.json'), '{}');
    const first = captureRevision(directory);
    expect(first.head).toBeNull(); expect(first.fileCount).toBe(1);
    expect(first.files[0].path).toBe('src/app.ts'); expect(first.workingTreeDigest).not.toBeNull();
    writeFileSync(join(directory, 'src/app.ts'), 'export const version = 2;');
    expect(captureRevision(directory).workingTreeDigest).not.toBe(first.workingTreeDigest);
  });
  it('removes accidentally inherited cloud credentials and enables deterministic demo', () => {
    const environment = offlineEnvironment({ PATH: 'safe-path', SystemRoot: 'C:\\Windows', OPENAI_API_KEY: 'synthetic-secret', NVIDIA_API_KEY: 'synthetic-secret-2', ALLOW_LIVE_API: 'true', APP_MODE: 'live', HTTP_PROXY: 'https://user:password@example.invalid', CUSTOM_UNTRUSTED: 'unsafe' });
    expect(environment.APP_MODE).toBe('demo'); expect(environment.ALLOW_LIVE_API).toBe('false');
    expect(environment.OPENAI_API_KEY).toBe(''); expect(environment.NVIDIA_API_KEY).toBe('');
    expect(environment.AI_RUN_BUDGET_USD).toBe('0'); expect(environment.ROUTING_ENABLED).toBe('false');
    expect(environment.PATH).toBe('safe-path'); expect(environment.HTTP_PROXY).toBeUndefined();
    expect(JSON.stringify(environment)).not.toContain('synthetic-secret');
  });
  it('scrubs known secrets, credential patterns and location fields before saving logs', () => {
    const raw = '\u001b[31mAuthorization: Bearer nvapi-1234567890123456789\nOPENAI_API_KEY="synthetic-owner-secret"\n{"longitude":71.123456,"latitude":51.123456}\nhttps://user:password@example.org/?longitude=71.23456&latitude=51.23456';
    const output = sanitizeLog(raw, { OPENAI_API_KEY: 'synthetic-owner-secret' });
    for (const value of ['nvapi-1234567890123456789', 'synthetic-owner-secret', '71.123456', '51.123456', '71.23456', '51.23456', 'user:password']) expect(output).not.toContain(value);
    expect(output).toContain('[REDACTED]'); expect(output).not.toContain('\u001b');
  });
  it('records a failing subprocess as failed and writes only scrubbed output', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'spot-harness-test-')); temporaryRoots.push(directory);
    const bin = join(directory, 'node_modules/eslint/bin'); mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'eslint.js'), 'console.error("Authorization: Bearer sk-syntheticSecret123456789"); process.exitCode=7;');
    vi.spyOn(console, 'log').mockImplementation(() => undefined); vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await runCheck('lint', directory, offlineEnvironment(), directory);
    expect(result.status).toBe('failed'); expect(result.exitCode).toBe(7);
    const output = readFileSync(join(directory, 'lint.log'), 'utf8');
    expect(output).not.toContain('sk-syntheticSecret123456789'); expect(output).toContain('[REDACTED]');
  });
});
