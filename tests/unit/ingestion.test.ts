import { describe, expect, it } from 'vitest';
import { normalize, type OsmElement } from '../../scripts/data/normalize';
import { validatePois } from '../../scripts/data/common';

const node: OsmElement = {type:'node',id:42,lat:51.1,lon:71.4,tags:{name:'Кофейня',amenity:'cafe'}};
const fetched='2026-10-16T10:00:00Z';
describe('actual-source normalization',()=>{
  it('does not infer indoor, outlets, quiet or opening hours from cafe category',()=>{
    const p=normalize([node],fetched).pois[0];
    expect(p.features).toEqual({outlets:null,wheelchair:null,indoor:null,quiet:null});
    expect(p.openingHours).toBeNull(); expect(p.confirmedAt).toBeNull();
    expect(p.evidence).toHaveLength(1);
  });
  it('rejects longitude/latitude swapped out of Astana bounds',()=>{
    const result=normalize([{...node,lat:71.4,lon:51.1}],fetched);
    expect(result.pois).toHaveLength(0);expect(result.rejected).toEqual(['osm:node/42']);
  });
  it('deduplicates stable source IDs and exact-name nearby node/building duplicates',()=>{
    const result=normalize([node,node,{...node,type:'way',id:43,lat:51.10001,lon:71.40001}],fetched);
    expect(result.pois).toHaveLength(1);expect(result.duplicates).toHaveLength(2);
  });
  it('keeps separate branches when equal names are far apart',()=>{
    expect(normalize([node,{...node,id:43,lat:51.12}],fetched).pois).toHaveLength(2);
  });
  it('does not turn limited accessibility into wheelchair=true',()=>{
    const p=normalize([{...node,tags:{...node.tags,wheelchair:'limited'}}],fetched).pois[0];
    expect(p.features.wheelchair).toBeNull();
  });
  it('keeps explicit negative feature evidence',()=>{
    const p=normalize([{...node,tags:{...node.tags,wheelchair:'no'}}],fetched).pois[0];
    expect(p.features.wheelchair).toBe(false);expect(p.evidence.some(e=>e.field==='wheelchair'&&e.value===false)).toBe(true);
  });
  it('hash excludes fetch time but changes when a source fact changes',()=>{
    const first=normalize([node],fetched).pois[0];
    const second=normalize([node],'2026-10-17T10:00:00Z').pois[0];
    const changed=normalize([{...node,tags:{...node.tags,opening_hours:'24/7'}}],fetched).pois[0];
    expect(first.contentHash).toBe(second.contentHash);expect(first.contentHash).not.toBe(changed.contentHash);
  });
  it('validates category evidence and source attribution',()=>{
    const p=normalize([node],fetched).pois[0];
    expect(validatePois([p])).toEqual([]);
    expect(validatePois([{...p,evidence:[]}])).toContain('Missing category evidence: osm:node/42');
  });
});
