import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
async function main() {
try { loadEnvFile('.env.local'); } catch { /* Optional in snapshot mode. */ }
const version = Number(process.versions.node.split('.')[0]);
console.log(`${version >= 22 ? 'PASS' : 'FAIL'} Node.js ${process.versions.node}; requires >=22`);
let count = 0;
try { count = JSON.parse(readFileSync('data/pois.json', 'utf8')).length; } catch { /* Report below. */ }
console.log(`${count > 0 ? 'PASS' : 'FAIL'} Real POI snapshot: ${count} places`);
console.log(`${existsSync('node_modules/next/package.json') ? 'PASS' : 'FAIL'} App dependencies`);
const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
console.log(`${configured ? 'CONFIGURED' : 'MISSING'} SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY (values hidden)`);
if(configured) {
  try {
    const target = new URL('/rest/v1/rpc/spot_nearby', process.env.SUPABASE_URL);
    const r = await fetch(target, {method:'POST', headers:{'content-type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY!}, body:JSON.stringify({query_longitude:71.4073303,query_latitude:51.0890897,radius_metres:3000,match_count:1}), signal:AbortSignal.timeout(6000)});
    console.log(`${r.ok ? 'PASS' : 'FAIL'} Supabase read-only RPC (HTTP ${r.status})`);
  } catch { console.log('FAIL Supabase read-only RPC unreachable; check local environment and migrations.'); }
}
try {
  const base = new URL(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw new Error();
  const response = await fetch(new URL('/api/tags',base),{signal:AbortSignal.timeout(2000)});
  const payload = await response.json();
  const names = (payload.models ?? []).map((model:{name:string})=>model.name);
  for(const wanted of [process.env.OLLAMA_CHAT_MODEL || 'qwen3:0.6b',process.env.OLLAMA_EMBED_MODEL || 'embeddinggemma']) console.log(`${names.some((name:string)=>name===wanted || name===`${wanted}:latest`) ? 'PASS' : 'MISSING'} Ollama model ${wanted}`);
} catch { console.log('MISSING Local Ollama. Install Ollama, pull models, then run data:embed to enable AI retrieval.'); }
const docker=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{timeout:3000,windowsHide:true});
console.log(`${docker.status===0?'PASS':'MISSING'} Docker daemon (optional for local Supabase)`);
console.log(`INFO Walking routes ${process.env.ROUTING_ENABLED==='false'?'disabled':'use public Valhalla; require internet'}. Map tiles and photos require internet.`);
console.log('INFO No secrets printed. Settings presence alone does not verify live RAG.');
if(version<22 || !count || !existsSync('node_modules/next/package.json'))process.exitCode=1;
}
main().catch(()=>{console.error('Doctor failed. Check dependencies and environment locally.');process.exitCode=1;});
