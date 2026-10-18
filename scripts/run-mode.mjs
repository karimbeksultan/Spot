import { spawn } from 'node:child_process';
const mode = process.argv[2];
if (!['demo', 'local'].includes(mode)) { console.error('Use demo or local'); process.exit(2); }
const environment = { ...process.env, APP_MODE: mode === 'demo' ? 'demo' : 'live', LLM_PRIMARY_PROVIDER: 'ollama', RETRIEVAL_PROVIDER: 'local',
  ALLOW_LIVE_API: 'false', ALLOW_PROVIDER_FAILOVER: 'false', OPENAI_API_KEY: '', NVIDIA_API_KEY: '', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '',
  ROUTING_ENABLED: mode === 'demo' ? 'false' : process.env.ROUTING_ENABLED || 'true', NEXT_TELEMETRY_DISABLED: '1' };
console.log(mode === 'demo' ? 'Spot demo: frozen clock, real snapshot, no AI/API calls.' : 'Spot local: local Qwen + embeddinggemma + snapshot vectors. No paid AI. Free routing receives coordinates if enabled.');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1'], { env: environment, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => { process.exitCode = code ?? 1; });
