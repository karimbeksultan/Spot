import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DATA_SNAPSHOT,dataLimitsCopy} from '../../src/components/DataLimits';

describe('public data notice',()=>{
  it('dated public counts match the stored corpus and reviewed city policy',()=>{
    const pois=JSON.parse(readFileSync('data/pois.json','utf8')) as {id:string}[];
    const policy=JSON.parse(readFileSync('data/scope-exclusions.json','utf8')) as {entries:{poiId:string}[]};
    const excluded=new Set(policy.entries.map(entry=>entry.poiId));
    expect(DATA_SNAPSHOT.stored).toBe(pois.length);
    expect(DATA_SNAPSHOT.eligible).toBe(pois.filter(poi=>!excluded.has(poi.id)).length);
    expect(DATA_SNAPSHOT.quarantined).toBe(pois.filter(poi=>excluded.has(poi.id)).length);
  });
  it.each(['ru','kk','en'] as const)('keeps source, model, privacy and accessibility distinctions in %s',language=>{
    const copy=dataLimitsCopy(language);
    expect(copy.osm).toContain('OpenStreetMap');expect(copy.commons).toContain('Wikimedia Commons');
    expect(copy.aiBody).toContain('embeddinggemma');expect(copy.aiBody).toContain('Qwen3:0.6b');
    expect(copy.privacyBody).toContain('POST');expect(copy.privacyBody).toContain('localStorage');
    expect(copy.accessibilityBody).toContain('reduced motion');expect(copy.translation).toContain('RU/KK/EN');
  });
});
