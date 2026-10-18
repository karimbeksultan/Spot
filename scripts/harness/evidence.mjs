import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const secretVariable = /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD|SERVICE_ROLE|PUBLISHABLE_KEY)/i;

/** Do not read environment files or include generated evidence in its own digest. */
export function includeInRevision(path) {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  return !parts.some(part => (part.startsWith('.env') && part !== '.env.example')
    || ['.git', '.next', 'node_modules', 'work', 'artifacts', 'outputs', 'coverage', 'test-results', 'playwright-report', '.supabase'].includes(part))
    && !normalized.startsWith('data/reports/')
    && !normalized.startsWith('docs/') && normalized !== 'README.md'
    && !normalized.endsWith('.tsbuildinfo')
    && !normalized.endsWith('.log');
}

export function manifestDigest(records) {
  const canonical = [...records].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function captureRevision(root = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const recordsFor = names => names.map(path => ({ path, sha256: existsSync(resolve(root, path)) && lstatSync(resolve(root, path)).isFile()
    ? createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') : null }));
  try {
    const names = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))]
      .filter(includeInRevision).sort();
    const files = recordsFor(names);
    const status = git('status', '--porcelain=v1', '-z').split('\0').filter(Boolean)
      .map(entry => entry.slice(3)).filter(includeInRevision).sort();
    return { head: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(),
      dirty: status.length > 0, workingTreeDigest: manifestDigest(files), fileCount: files.length,
      dirtyPaths: status, exclusions: '.env* except .env.example; generated work/artifacts/reports/build/cache outputs; documentation and slide artifacts (checked separately)', files };
  } catch {
    // A submitted source archive may legitimately omit .git. Bind its checks to real files too.
    const names = [];
    const walk = prefix => {
      for (const entry of readdirSync(resolve(root, prefix), { withFileTypes: true })) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!includeInRevision(path)) continue;
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) names.push(path);
      }
    };
    let complete = true;
    try { walk(''); } catch { complete = false; }
    let files = [];
    try { files = recordsFor(names.sort()); } catch { complete = false; }
    return { head: null, branch: null, dirty: null, workingTreeDigest: files.length ? manifestDigest(files) : null, fileCount: files.length,
      digestComplete: complete, dirtyPaths: [], exclusions: complete ? 'Git metadata unavailable; application input digest, excluding secret/generated files, documentation/slide artifacts and symlinks' : 'File digest incomplete: unreadable archive inputs', files };
  }
}

/**
 * Logs are bounded and scrubbed before they are written, never after publication.
 * @param {unknown} value
 * @param {Record<string, string | undefined>} environment
 */
export function sanitizeLog(value, environment = process.env) {
  let text = String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const [name, secret] of Object.entries(environment)) {
    if (secretVariable.test(name) && typeof secret === 'string' && secret.length >= 6) text = text.replaceAll(secret, '[REDACTED]');
  }
  text = text
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|nvapi-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[REDACTED]')
    .replace(/((?:authorization|api[_-]?key|service[_-]?role[_-]?key|password|secret)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/(["']?(?:longitude|latitude)["']?\s*[:=]\s*)-?\d+(?:\.\d+)?/gi, '$1[REDACTED]')
    .replace(/([?&](?:lat(?:itude)?|lon(?:gitude)?|lng)=)[^&\s]+/gi, '$1[REDACTED]');
  const limit = 120_000;
  return text.length > limit ? `${text.slice(0, limit)}\n[LOG TRUNCATED AT ${limit} CHARACTERS]\n` : text;
}

/**
 * Keep desktop/runtime essentials, but do not inherit provider credentials.
 * @param {Record<string, string | undefined>} source
 * @returns {Record<string, string | undefined>}
 */
export function offlineEnvironment(source = process.env) {
  const safe = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'CI', 'TERM', 'FORCE_COLOR']);
  const result = Object.fromEntries(Object.entries(source).filter(([name]) => safe.has(name.toUpperCase())));
  return { ...result, APP_MODE: 'demo', ALLOW_LIVE_API: 'false', ALLOW_PROVIDER_FAILOVER: 'false',
    SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '',
    OPENAI_API_KEY: '', NVIDIA_API_KEY: '', AI_MAX_REQUESTS_PER_RUN: '0', AI_RUN_BUDGET_USD: '0', AI_DAILY_BUDGET_USD: '0',
    OLLAMA_BASE_URL: 'http://127.0.0.1:1', ROUTING_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' };
}
