import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

/** @param {string} mode @param {Record<string, string | undefined>} [source] */
export function modeConfiguration(mode, source = process.env) {
  if (!['demo', 'local'].includes(mode)) throw new Error('Use demo or local');
  const host = source.SPOT_HOST ?? '127.0.0.1';
  if (host !== 'localhost' && !isIP(host)) throw new Error('SPOT_HOST must be localhost or an IP address');
  const port = source.PORT ?? '3000';
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const environment = { ...source, APP_MODE: mode === 'demo' ? 'demo' : 'live', LLM_PRIMARY_PROVIDER: 'ollama', RETRIEVAL_PROVIDER: 'local',
    ALLOW_LIVE_API: 'false', ALLOW_PROVIDER_FAILOVER: 'false', OPENAI_API_KEY: '', NVIDIA_API_KEY: '', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '',
    ROUTING_ENABLED: mode === 'demo' ? 'false' : source.ROUTING_ENABLED || 'true', NEXT_TELEMETRY_DISABLED: '1' };
  return { args: ['node_modules/next/dist/bin/next', 'start', '--hostname', host, '--port', port], environment };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  let config;
  try { config = modeConfiguration(mode); } catch (error) { console.error(error.message); process.exit(2); }
  console.log(mode === 'demo' ? 'Spot demo: frozen clock, real snapshot, no AI/API calls.' : 'Spot local: local Qwen + embeddinggemma + snapshot vectors. No paid AI. Free routing receives coordinates if enabled.');
  const child = spawn(process.execPath, config.args, { env: config.environment, stdio: 'inherit', windowsHide: true });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
