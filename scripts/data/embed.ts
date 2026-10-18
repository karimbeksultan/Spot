import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { dataDir, documentFor, fetchJson, ingestionTarget, loadPois, writeJson } from './common';
import { sha256 } from './common';
import { validateImport } from './import-plan';

async function main() {
  const pois = await loadPois();
  const errors = validateImport(pois); if (errors.length) throw new Error(errors.join('\n'));
  const model = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma';
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? '768');
  const version = process.env.EMBEDDING_VERSION ?? '1';
  if (dimensions !== 768) throw new Error('Migration requires 768-dimensional embeddings. Controlled schema change and full reindex required for another dimension.');
  if (version !== '1') throw new Error('Retrieval currently requires embedding version 1. Update retrieval and reindex together before changing it.');
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, provider: 'ollama', model, dimensions, version, records: pois.length,
      documentsDigest: sha256(pois.map(poi => ({ id: poi.id, document: documentFor(poi), contentHash: poi.contentHash }))),
      databaseComparison: 'not_run', embeddingRequests: 0, databaseWrites: 0, credentialsRequired: false,
      note: 'Existing index compatibility and unchanged-document skips are checked only against an explicitly authorized database. No reindex was performed.' }, null, 2));
    return;
  }
  const {url,key} = ingestionTarget();
  const base = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
  if (!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)) throw new Error('This prototype only sends embedding documents to local Ollama.');
  const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20_000)})}});
  const {data:existing,error} = await db.from('poi_documents').select('poi_id,document_hash,embedding_model,embedding_dimensions,embedding_version');
  if (error) throw new Error('Cannot read embedding metadata. Check the migration and service key.');
  let updated=0; let skipped=0;
  for (const poi of pois) {
    const old = existing?.find(row=>row.poi_id===poi.id);
    if (old?.document_hash===poi.contentHash && old.embedding_model===model && old.embedding_dimensions===dimensions && old.embedding_version===version) {skipped++;continue;}
    const document = documentFor(poi);
    const response: {model:string;embeddings:number[][]} = await fetchJson<{model:string;embeddings:number[][]}>(`${base}/api/embed`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,input:document,dimensions,truncate:false,keep_alive:'30s',options:{num_thread:2,num_ctx:2048}})},90_000);
    if (response.model!==model && response.model!==`${model}:latest`) throw new Error('Embedding response model does not match the requested model.');
    const embedding: number[] | undefined=response.embeddings?.[0];
    if (!embedding || embedding.length!==dimensions || embedding.some(v=>!Number.isFinite(v)) || !embedding.some(v=>v!==0)) throw new Error('Embedding response has incompatible dimensions or invalid values.');
    const {error:writeError}=await db.from('poi_documents').upsert({poi_id:poi.id,document,document_hash:poi.contentHash,embedding,embedding_model:model,embedding_dimensions:dimensions,embedding_version:version,updated_at:new Date().toISOString()},{onConflict:'poi_id'});
    if (writeError) throw new Error('Embedding upsert failed. Check the migration.');
    updated++;
  }
  const report={finishedAt:new Date().toISOString(),model,dimensions,version,updated,skipped};
  await writeJson(resolve(dataDir,'reports/embedding.json'),report); console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error instanceof Error ? error.message : 'Embedding failed');process.exitCode=1;});
