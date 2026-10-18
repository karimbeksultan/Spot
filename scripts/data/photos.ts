import { resolve } from 'node:path';
import type { Poi } from '../../src/lib/types';
import { dataDir, fetchJson, plainText, readJson, writeJson } from './common';

export type PhotoLink = { poiId: string; title: string; matchEvidence: string; caption?: string };
export type CommonsPage = { title: string; missing?: string; categories?: { title: string }[]; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] };
type CommonsResponse = { query?: { pages: Record<string, CommonsPage> }; error?:{info:string} };
const titleKey=(title:string)=>title.replaceAll('_',' ').trim();
const blockedCategory=/deletion|no permission|copyright violation|non-free|no freedom of panorama/i;

export function photoFromPage(page:CommonsPage|undefined):Poi['photos'][number]|null{
  const info=page?.imageinfo?.[0];
  if(!page||!info||page.missing!==undefined||page.categories?.some(c=>blockedCategory.test(c.title)))return null;
  const meta=info.extmetadata;
  if(blockedCategory.test(meta.Categories?.value??''))return null;
  const license=plainText(meta.LicenseShortName?.value??'');const author=plainText(meta.Artist?.value??'');
  if(!/^(CC BY(?:-SA)? [234]\.0|CC0(?: 1\.0)?|Public domain)$/.test(license)||!author)return null;
  try{
    const url=new URL(info.thumburl??info.url);const source=new URL(info.descriptionurl);
    if(url.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname)||source.protocol!=='https:'||source.hostname!=='commons.wikimedia.org')return null;
    let licenseUrl:string|undefined;
    if(meta.LicenseUrl?.value){const value=new URL(meta.LicenseUrl.value);if(value.hostname==='creativecommons.org'){value.protocol='https:';licenseUrl=value.href;}}
    return {url:url.href,sourceUrl:source.href,author,license,...(licenseUrl?{licenseUrl}:{}),attribution:`${author} · ${license} · Wikimedia Commons. Фото может быть историческим; кадрирование в интерфейсе.`};
  }catch{return null;}
}

export function attachReviewedPhotos(pois:Poi[],links:PhotoLink[],pages:Record<string,CommonsPage>):Poi[]{
  const byTitle=new Map(Object.values(pages).map(page=>[titleKey(page.title),page]));
  return pois.map(poi=>{
    const photos:Poi['photos']=[];const seen=new Set<string>();
    for(const link of links.filter(link=>link.poiId===poi.id)){
      if(!link.matchEvidence?.trim())continue;
      const photo=photoFromPage(byTitle.get(titleKey(link.title)));
      if(!photo||seen.has(photo.sourceUrl))continue;
      seen.add(photo.sourceUrl);photos.push({...photo,...(link.caption?{caption:plainText(link.caption).slice(0,500)}:{})});if(photos.length===10)break;
    }
    return {...poi,photos};
  });
}

/** Only explicitly reviewed POI/file links are eligible. Nearby or keyword-search images are never auto-assigned. */
export async function enrichPhotos(pois: Poi[], replay: boolean, persist = true): Promise<Poi[]> {
  let links: PhotoLink[];
  try { links = await readJson<PhotoLink[]>(resolve(dataDir,'photo-links.json')); } catch { return pois; }
  if (!links.length) return pois;
  const cachePath=resolve(dataDir,'raw/commons.json');
  const previous=await readJson<CommonsResponse>(cachePath).catch(()=>({query:{pages:{}}}));
  const pages:Record<string,CommonsPage>={...previous.query?.pages};const failures:string[]=[];
  if(!replay){
    const titles=[...new Set(links.map(link=>titleKey(link.title)))];
    for(let offset=0;offset<titles.length;offset+=25){
      const batch=titles.slice(offset,offset+25);
      const params=new URLSearchParams({action:'query',format:'json',maxlag:'5',titles:batch.join('|'),prop:'imageinfo|categories',iiprop:'url|extmetadata',iiurlwidth:'960',cllimit:'max'});
      try{
        const response=await fetchJson<CommonsResponse>(`https://commons.wikimedia.org/w/api.php?${params}`,{},30000);
        if(response.error||!response.query?.pages)throw new Error(response.error?.info??'Missing photo metadata');
        Object.assign(pages,response.query.pages);console.log(`Photo metadata ${Math.min(offset+25,titles.length)}/${titles.length}`);
      }catch{failures.push(...batch);console.warn(`Photo metadata batch unavailable (${batch.length}); retained validated cached metadata.`);}
      if(offset+25<titles.length)await new Promise(r=>setTimeout(r,5000));
    }
    if(persist)await writeJson(cachePath,{fetchedAt:new Date().toISOString(),query:{pages}});
  }
  const enriched=attachReviewedPhotos(pois,links,pages);
  if(persist)await writeJson(resolve(dataDir,'reports/photo-enrichment.json'),{checkedAt:new Date().toISOString(),replay,reviewedLinks:links.length,coveredPois:enriched.filter(p=>p.photos.length).length,totalPhotos:enriched.reduce((sum,p)=>sum+p.photos.length,0),failedMetadataTitles:failures,results:enriched.map(p=>({poiId:p.id,name:p.name,photos:p.photos.length}))});
  return enriched;
}
