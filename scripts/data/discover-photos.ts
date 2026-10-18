import { resolve } from 'node:path';
import { dataDir, fetchJson, loadPois, readJson, writeJson } from './common';
type GeoFile={pageid:number;title:string;lat:number;lon:number};
type GeoResponse={query?:{geosearch:GeoFile[]};error?:{info:string}};
const zones=[{name:'expo',lat:51.09,lon:71.412},{name:'botanical',lat:51.1062,lon:71.4166},{name:'central',lat:51.129,lon:71.422}];
async function main(){
  const snapshotPath=resolve(dataDir,'raw/photos-geography.json');
  let snapshot:{fetchedAt:string;zones:unknown[];files:GeoFile[]};
  if(process.argv.includes('--from-snapshot'))snapshot=await readJson(snapshotPath);
  else{
    const files=new Map<number,GeoFile>();const audits:unknown[]=[];
    for(const zone of zones){
      const params=new URLSearchParams({action:'query',format:'json',maxlag:'5',list:'geosearch',gscoord:`${zone.lat}|${zone.lon}`,gsradius:'3000',gslimit:'500',gsnamespace:'6'});
      const sourceUrl=`https://commons.wikimedia.org/w/api.php?${params}`;
      const data=await fetchJson<GeoResponse>(sourceUrl);
      if(data.error||!data.query)throw new Error(data.error?.info||'Missing geography response');
      data.query.geosearch.forEach(file=>files.set(file.pageid,file));
      audits.push({...zone,sourceUrl,count:data.query.geosearch.length});
      console.log(`${zone.name}: ${data.query.geosearch.length} nearby photo records`);
      await new Promise(r=>setTimeout(r,1000));
    }
    snapshot={fetchedAt:new Date().toISOString(),zones:audits,files:[...files.values()]};await writeJson(snapshotPath,snapshot);
  }
  const pois=await loadPois();
  const results=pois.map(poi=>({poiId:poi.id,name:poi.name,category:poi.category,candidates:snapshot.files.map(file=>({...file,approxDistanceMetres:Math.round(Math.hypot((poi.location.latitude-file.lat)*111320,(poi.location.longitude-file.lon)*70000))})).filter(file=>file.approxDistanceMetres<=(poi.category==='cafe'?120:500)).sort((a,b)=>a.approxDistanceMetres-b.approxDistanceMetres).slice(0,30)}));
  await writeJson(resolve(dataDir,'reports/photo-geographic-candidates.json'),{generatedAt:new Date().toISOString(),sourceFetchedAt:snapshot.fetchedAt,totalFiles:snapshot.files.length,note:'Candidate discovery only. Camera proximity never proves the photographed subject or reuse permission. Every accepted image needs a reviewed POI/file link and license metadata.',results});
  console.log(`Reviewed candidate index: ${results.length} POIs, ${results.filter(r=>r.candidates.length).length} with nearby files. No photos automatically assigned.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Photo discovery failed');process.exitCode=1;});
