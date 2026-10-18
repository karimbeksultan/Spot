import { resolve } from 'node:path';
import { dataDir, loadPois, validatePois, writeJson } from './common';
import { enrichPhotos } from './photos';
async function main(){
  const current=await loadPois();const enriched=await enrichPhotos(current,process.argv.includes('--from-snapshot'));
  const errors=validatePois(enriched);if(errors.length)throw new Error(errors.join('\n'));
  if(enriched.some((poi,i)=>poi.contentHash!==current[i].contentHash))throw new Error('Photo refresh must not change searchable facts or embedding hashes.');
  await writeJson(resolve(dataDir,'pois.json'),enriched);
  console.log(JSON.stringify({places:enriched.length,withPhotos:enriched.filter(p=>p.photos.length).length,totalPhotos:enriched.reduce((sum,p)=>sum+p.photos.length,0),embeddings:'Unchanged; photographs are not search-document facts.'},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Photo refresh failed');process.exitCode=1;});
