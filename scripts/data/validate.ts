import { resolve } from 'node:path';
import { dataDir, loadPois, writeJson } from './common';
async function main() {
  const pois = await loadPois();
  const report = { checkedAt: new Date().toISOString(), count: pois.length, categories: Object.fromEntries([...new Set(pois.map(p=>p.category))].map(c=>[c,pois.filter(p=>p.category===c).length])), withPhotos:pois.filter(p=>p.photos.length).length, withOpeningHours:pois.filter(p=>p.openingHours).length, withConfirmedOutlets:pois.filter(p=>p.features.outlets===true).length, evidenceCount:pois.reduce((n,p)=>n+p.evidence.length,0), checks:'unique IDs, bounds/order, required fields, attribution, category evidence, tri-state values' };
  await writeJson(resolve(dataDir,'reports/quality.json'),report); console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{ console.error(error instanceof Error ? error.message : 'Validation failed'); process.exitCode=1; });
