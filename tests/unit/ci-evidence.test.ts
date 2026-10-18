import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { collectCiEvidence } from '../../scripts/harness/collect-ci-evidence.mjs';

const temporaryRoots: string[] = [];
const current = 'a'.repeat(40);
const historical = 'b'.repeat(40);
afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !directory.includes('spot-ci-evidence-test-')) throw new Error('Unexpected temporary root');
    rmSync(directory, { recursive: true, force: true });
  }
});
function setup() {
  const temporary = mkdtempSync(join(tmpdir(), 'spot-ci-evidence-test-')); temporaryRoots.push(temporary);
  const root = join(temporary, 'repository'); mkdirSync(root);
  return { root, output: join(temporary, 'collected') };
}
function receipt(root: string, command: 'doctor' | 'verify', head: string, status = 'passed') {
  const folder = join(root, 'artifacts/verification', `${head.slice(0, 8)}-${command}`); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'report.json'), JSON.stringify({ command, status, revision: { head }, checks: command === 'verify' ? [{ check: 'unit', status, log: 'unit.log' }] : [{ check: 'doctor', status, result: 'doctor.json' }] }));
  if (command === 'verify') writeFileSync(join(folder, 'unit.log'), 'Authorization: Bearer sk-syntheticSecret123456789\nunit failed\n');
  else writeFileSync(join(folder, 'doctor.json'), '{"passed":true}');
}

it('publishes only this checkout evidence, preserves failure status and removes log credentials', () => {
  const { root, output } = setup();
  receipt(root, 'doctor', current); receipt(root, 'verify', current, 'failed'); receipt(root, 'verify', historical);
  const manifest = collectCiEvidence(root, output, current);
  expect(manifest.receipts).toHaveLength(2);
  expect(manifest.receipts.find(value => value.command === 'verify')?.status).toBe('failed');
  const paths = manifest.receipts.flatMap(value => value.files.map(file => file.path));
  expect(paths.some(path => path.includes(historical.slice(0, 8)))).toBe(false);
  const log = readFileSync(join(output, paths.find(path => path.endsWith('unit.log'))!), 'utf8');
  expect(log).not.toContain('sk-syntheticSecret123456789'); expect(log).toContain('[REDACTED]'); expect(log).toContain('unit failed');
});

it('refuses to publish historical-only or missing verify evidence and never writes into the repository', () => {
  const { root, output } = setup();
  receipt(root, 'doctor', current); receipt(root, 'verify', historical);
  expect(() => collectCiEvidence(root, output, current)).toThrow('CURRENT_CI_RECEIPTS_MISSING');
  expect(() => collectCiEvidence(root, join(root, 'src'), current)).toThrow('OUTSIDE_REPOSITORY');
  expect(() => collectCiEvidence(root, output, 'not-a-commit')).toThrow('CI_COMMIT_REQUIRED');
});
