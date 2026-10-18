import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sanitizeLog } from './evidence.mjs';

const allowedFiles = new Set(['report.json', 'doctor.json', 'evaluation.json', 'smoke.json',
  ...['lint', 'typecheck', 'unit', 'data', 'snapshot', 'eval', 'build', 'smoke'].map(name => `${name}.log`)]);

/** Keep current CI receipts separate from historical evidence checked into the repository. */
export function collectCiEvidence(root, destination, head) {
  if (!/^[a-f0-9]{40}$/.test(head ?? '')) throw new Error('CI_COMMIT_REQUIRED');
  const repository = resolve(root);
  const output = resolve(destination);
  if (output === repository || output.startsWith(repository + sep)) throw new Error('CI_EVIDENCE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  if (existsSync(output) && readdirSync(output).length) throw new Error('CI_EVIDENCE_OUTPUT_NOT_EMPTY');
  const source = join(repository, 'artifacts', 'verification');
  const selected = [];
  if (existsSync(source)) {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/-(doctor|verify)$/.test(entry.name)) continue;
      const directory = join(source, entry.name);
      const reportFile = join(directory, 'report.json');
      if (!existsSync(reportFile) || !lstatSync(reportFile).isFile()) continue;
      let report;
      try { report = JSON.parse(readFileSync(reportFile, 'utf8')); } catch { continue; }
      if (!['doctor', 'verify'].includes(report.command) || report.revision?.head !== head) continue;
      selected.push({ directory, name: entry.name, report });
    }
  }
  // A missing verify receipt must never look like a successful verification artifact.
  if (!['doctor', 'verify'].every(command => selected.some(value => value.report.command === command))) throw new Error('CURRENT_CI_RECEIPTS_MISSING');
  mkdirSync(output, { recursive: true });
  const receipts = [];
  for (const { directory, name, report } of selected) {
    const files = [];
    const requested = ['report.json', ...report.checks.flatMap(check => [check.log, check.result].filter(Boolean))];
    if (report.command === 'verify') requested.push('evaluation.json', 'smoke.json');
    for (const file of [...new Set(requested)]) {
      if (!allowedFiles.has(file)) throw new Error('CI_EVIDENCE_FILE_NOT_ALLOWLISTED');
      const input = join(directory, file);
      if (!existsSync(input)) {
        if (file === 'evaluation.json' || file === 'smoke.json') continue;
        throw new Error('CI_EVIDENCE_FILE_MISSING');
      }
      if (!lstatSync(input).isFile()) throw new Error('CI_EVIDENCE_SYMLINK_FORBIDDEN');
      const raw = readFileSync(input);
      const content = file.endsWith('.log') ? Buffer.from(sanitizeLog(raw.toString('utf8'))) : raw;
      mkdirSync(join(output, name), { recursive: true });
      writeFileSync(join(output, name, file), content);
      files.push({ path: `${name}/${file}`, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    }
    receipts.push({ command: report.command, status: report.status, head, directory: name, files });
  }
  const manifest = { schemaVersion: 1, head, scope: 'Only completed doctor/verify reports bound to this CI checkout; historical receipts excluded; logs scrubbed again', receipts };
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.RUNNER_TEMP) throw new Error('CI_TEMP_DIRECTORY_REQUIRED');
    const result = collectCiEvidence(process.cwd(), join(process.env.RUNNER_TEMP, 'spot-evidence'), process.env.GITHUB_SHA);
    console.log(`Collected ${result.receipts.length} current CI receipts for ${result.head}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'CI_EVIDENCE_COLLECTION_FAILED');
    process.exitCode = 1;
  }
}
