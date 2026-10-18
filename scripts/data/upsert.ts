import { createClient } from '@supabase/supabase-js';
import { ingestionTarget, loadPois } from './common';
import { planImport } from './import-plan';
async function main() {
  const pois = await loadPois();
  const plan = planImport(pois, []);
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, source: 'validated-local-real-source-snapshot', records: pois.length,
      payloadDigest: plan.outputDigest, duplicateIds: 0, deleted: 0, databaseComparison: 'not_run',
      databaseWrites: 0, credentialsRequired: false, note: 'Payload validation only. Insert/update/unchanged counts require an explicitly authorized target database read.' }, null, 2));
    return;
  }
  const { url, key } = ingestionTarget();
  const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20_000)})}});
  const { data:run,error:runError } = await db.from('ingestion_runs').insert({status:'running',source:'OpenStreetMap/Overpass + reviewed Wikimedia Commons metadata',fetched_count:pois.length,accepted_count:0,rejected_count:0}).select('id').single();
  if (runError || !run) throw new Error('Cannot start ingestion log. Check migration and privileged server key.');
  // A bounded batch and stable source ID make repeat runs idempotent.
  let accepted = 0;
  try {
  for (let offset=0;offset<pois.length;offset+=50) {
    const rows = pois.slice(offset,offset+50).map(poi=>({id:poi.id,name:poi.name,description:poi.description,category:poi.category,longitude:poi.location.longitude,latitude:poi.location.latitude,payload:poi,content_hash:poi.contentHash}));
    const {error} = await db.from('pois').upsert(rows,{onConflict:'id'});
    if (error) throw new Error('POI upsert failed. Check migration, service key, and table grants.');
    accepted += rows.length;
  }
  const {error:finishError} = await db.from('ingestion_runs').update({status:'completed',finished_at:new Date().toISOString(),accepted_count:accepted}).eq('id',run.id);
  if (finishError) throw new Error('POIs saved, but completing the ingestion log failed.');
  } catch (error) {
    await db.from('ingestion_runs').update({status:'failed',finished_at:new Date().toISOString(),accepted_count:accepted,error_summary:'Ingestion interrupted; rerun is idempotent. Check local CLI output.'}).eq('id',run.id);
    throw error;
  }
  console.log(`Upserted ${pois.length} POIs. Embeddings are updated separately by data:embed.`);
}
main().catch(error=>{console.error(error instanceof Error ? error.message : 'Upsert failed');process.exitCode=1;});
