import { describe, expect, it } from 'vitest';
import { attachReviewedPhotos, photoFromPage, type CommonsPage } from '../../scripts/data/photos';
import { normalize } from '../../scripts/data/normalize';
import { documentFor } from '../../scripts/data/common';

function page(title='File:Garden.jpg'):CommonsPage {
 return {title,imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Garden.jpg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Garden.jpg/960px-Garden.jpg',descriptionurl:`https://commons.wikimedia.org/wiki/${title}`,extmetadata:{Artist:{value:'<a href="/wiki/User:Photographer">Photographer</a>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'http://creativecommons.org/licenses/by-sa/4.0/'}}}]};
}
const poi=()=>normalize([{type:'node',id:42,lat:51.1,lon:71.4,tags:{name:'Garden',leisure:'park'}}],'2026-10-16T10:00:00Z').pois[0];
describe('reviewed POI photography',()=>{
 it('keeps photographer, source and HTTPS license attribution',()=>{
  expect(photoFromPage(page())).toMatchObject({author:'Photographer',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',sourceUrl:'https://commons.wikimedia.org/wiki/File:Garden.jpg'});
 });
 it.each(['All rights reserved','Fair use','CC BY-NC 4.0'])('rejects a nonapproved license: %s',license=>{
  const p=page();p.imageinfo![0].extmetadata.LicenseShortName.value=license;expect(photoFromPage(p)).toBeNull();
 });
 it('rejects missing permission, deleted files, unknown authors and external media hosts',()=>{
  expect(photoFromPage({...page(),categories:[{title:'Category:Items with no permission'}]})).toBeNull();
  expect(photoFromPage({...page(),missing:''})).toBeNull();
  const unknown=page();unknown.imageinfo![0].extmetadata.Artist.value='';expect(photoFromPage(unknown)).toBeNull();
  const external=page();external.imageinfo![0].thumburl='https://example.com/photo.jpg';expect(photoFromPage(external)).toBeNull();
 });
 it('does not assign unreviewed, mismatched or duplicate photographs',()=>{
  const p=poi();const pages={one:page(),two:page('File:Another.jpg')};
  const result=attachReviewedPhotos([p],[{poiId:p.id,title:'File:Garden.jpg',matchEvidence:''},{poiId:'osm:node/43',title:'File:Another.jpg',matchEvidence:'Another branch'}],pages);
  expect(result[0].photos).toEqual([]);
  const link={poiId:p.id,title:'File:Garden.jpg',matchEvidence:'Exact park name and category confirmed'};
  expect(attachReviewedPhotos([p],[link,link],pages)[0].photos).toHaveLength(1);
 });
 it('adds up to ten distinct reviewed photos without changing retrieval facts or embedding hashes',()=>{
  const p=poi();const pages=Object.fromEntries(Array.from({length:12},(_,i)=>[i,page(`File:Garden_${i}.jpg`)]));
  const links=Object.values(pages).map(picture=>({poiId:p.id,title:picture.title.replaceAll('_',' '),matchEvidence:'Same verified park'}));
  const [updated]=attachReviewedPhotos([p],links,pages);
  expect(updated.photos).toHaveLength(10);expect(updated.contentHash).toBe(p.contentHash);expect(documentFor(updated)).toBe(documentFor(p));expect(updated.evidence).toEqual(p.evidence);
 });
});
