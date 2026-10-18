import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureRevision, offlineEnvironment, sanitizeLog } from './evidence.mjs';

const commands = {
  lint: ['node_modules/eslint/bin/eslint.js', '.'],
  typecheck: ['node_modules/typescript/bin/tsc', '--noEmit'],
  unit: ['node_modules/vitest/vitest.mjs', 'run'],
  data: ['node_modules/tsx/dist/cli.mjs', 'scripts/data/validate.ts'],
  snapshot: ['node_modules/tsx/dist/cli.mjs', 'tests/evaluate-snapshot.ts'],
  build: ['node_modules/next/dist/bin/next', 'build'],
  smoke: ['node_modules/tsx/dist/cli.mjs', 'scripts/harness/checks.ts', 'smoke'],
  eval: ['node_modules/tsx/dist/cli.mjs', 'scripts/harness/checks.ts', 'eval'],
};

/** @returns {Promise<{check: string, command: string, startedAt: string, finishedAt: string, elapsedMs: number, exitCode: number | null, signal: string | null, timedOut: boolean, status: string, log: string}>} */
export function runCheck(name, directory, environment, root = process.cwd()) {
  const args = commands[name];
  if (!args) throw new Error('UNKNOWN_CHECK');
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  return new Promise(resolveResult => {
    let output = '';
    let timedOut = false;
    let spawnError = false;
    const limit = name === 'build' || name === 'lint' ? 360_000 : 180_000;
    const child = spawn(process.execPath, args, { cwd: root, env: environment, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = chunk => { if (output.length < 240_000) output += chunk.toString(); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', () => { spawnError = true; output += '\nSubprocess could not start.\n'; });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, limit);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const safeOutput = sanitizeLog(output);
      const file = `${name}.log`;
      writeFileSync(resolve(directory, file), safeOutput);
      const passed = code === 0 && !timedOut && !spawnError;
      const result = { check: name, command: `node ${args.join(' ')}`, startedAt, finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started, exitCode: code, signal, timedOut, status: passed ? 'passed' : 'failed', log: file };
      console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (${result.elapsedMs} ms; exit ${code ?? 'none'})`);
      if (!passed) console.error(safeOutput.slice(-4000));
      resolveResult(result);
    });
  });
}

function doctor() {
  let snapshotCount = 0;
  try { const value = JSON.parse(readFileSync('data/pois.json', 'utf8')); snapshotCount = Array.isArray(value) ? value.length : 0; } catch { /* Report failure below. */ }
  const checks = [
    { name: 'runtime', passed: Number(process.versions.node.split('.')[0]) >= 22, detail: `Node ${process.versions.node}; requires >=22` },
    { name: 'dependencies', passed: existsSync('node_modules/next/package.json') && existsSync('node_modules/tsx/dist/cli.mjs'), detail: 'Next and TSX installed locally' },
    { name: 'real_snapshot', passed: snapshotCount > 0, detail: `${snapshotCount} POI records; validate/eval checks fields separately` },
    { name: 'example_config', passed: existsSync('.env.example'), detail: 'Example configuration exists; local secret files are not read' },
  ];
  const providerReadiness = ['OPENAI', 'NVIDIA'].map(provider => ({ provider: provider.toLowerCase(),
    keyPresentInProcess: Boolean(process.env[`${provider}_API_KEY`]), modelPresentInProcess: Boolean(process.env[`${provider}_MODEL`]),
    verified: false, status: 'not_probed', reason: 'Offline doctor never makes paid API requests; presence is not access verification' }));
  return { mode: 'demo', checks, providerReadiness, localEnvironmentFilePresent: existsSync('.env.local'),
    localEnvironmentFileRead: false, networkRequests: 0, paidRequests: 0, liveVerified: false,
    nextStep: 'Use demo or local Qwen without cloud keys. Cloud providers are optional; keys plus explicit finite authorization/budgets are required only for an owner-approved cloud smoke.',
    passed: checks.every(check => check.passed) };
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'doctor';
  if (!['doctor', 'verify', 'eval', 'smoke'].includes(command) || argv.length > 1) {
    console.error('Usage: node scripts/harness/runner.mjs doctor|verify|eval|smoke');
    process.exitCode = 2;
    return;
  }
  const revision = captureRevision();
  const id = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}-${command}`;
  const directory = resolve('artifacts/verification', id);
  mkdirSync(directory, { recursive: true });
  const report = { schemaVersion: 1, command, startedAt: new Date().toISOString(), revision,
    mode: 'demo', source: 'actual collected POI snapshot; synthetic evaluation requests; deterministic generation; no paid LLM',
    environmentPolicy: 'Credentials removed; APP_MODE=demo, ALLOW_LIVE_API=false, routing disabled, no provider failover',
    browser: { status: 'not_run', reason: 'Browser verification is a separate explicit integration check, not silently counted as passed' },
    checks: [], status: 'failed' };
  try {
    if (command === 'doctor') {
      const result = doctor();
      writeFileSync(resolve(directory, 'doctor.json'), JSON.stringify(result, null, 2) + '\n');
      report.checks.push({ check: 'doctor', status: result.passed ? 'passed' : 'failed', result: 'doctor.json' });
      console.log(JSON.stringify(result, null, 2));
    } else {
      const names = command === 'verify' ? ['lint', 'typecheck', 'unit', 'data', 'snapshot', 'eval', 'build', 'smoke'] : [command];
      const environment = { ...offlineEnvironment(), SPOT_VERIFICATION_DIR: directory };
      for (const name of names) report.checks.push(await runCheck(name, directory, environment));
    }
    report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  } catch {
    report.checks.push({ check: 'harness', status: 'failed', reason: 'Unexpected local harness error; inspect installation and filesystem permissions' });
  } finally {
    report.finishedAt = new Date().toISOString();
    report.revisionAfter = captureRevision();
    report.applicationFilesChangedDuringChecks = revision.workingTreeDigest !== report.revisionAfter.workingTreeDigest;
    if (!revision.workingTreeDigest || revision.digestComplete === false || !report.revisionAfter.workingTreeDigest || report.revisionAfter.digestComplete === false) {
      report.status = 'failed';
      report.checks.push({ check: 'revision_evidence', status: 'failed', reason: 'Could not bind checks to a complete digest of readable application inputs' });
    }
    if (command !== 'doctor' && report.applicationFilesChangedDuringChecks) {
      report.status = 'failed';
      report.checks.push({ check: 'revision_stability', status: 'failed', reason: 'Application inputs changed during verification; rerun against a stable working tree' });
    }
    const destination = resolve(directory, 'report.json');
    writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    console.log(`Verification report: ${destination}`);
    if (report.status !== 'passed') process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
