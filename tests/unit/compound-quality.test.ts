/** Fixed BEFORE/AFTER semantic acceptance over real data. No live model, network, or jury grading. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from '../../src/lib/search';
import { interpretRequest, searchRequestSchema, type Poi, type SearchResponse } from '../../src/lib/types';
import development from '../eval/compound-development.json';
import acceptance from '../eval/compound-acceptance.json';

type Stage={category?:string;venueType?:string;cuisines?:string[]};
type Scenario={id:string;purpose:string;request:Record<string,unknown>;beforeRequestSha256:string;
 expected:{kinds:string[];stages?:Stage[];ordered?:boolean;empty?:boolean;requestedMinutes?:number;clarificationCode?:string}};
type SourceFacts={venueType:string|null;cuisines:string[]};
type RuntimePoi=Poi&{sourceFacts?:SourceFacts;evidenceIds:string[]};
type RuntimeResponse=SearchResponse&{journey?:{status:'complete'|'unverified'|'incomplete';stages:{index:number;kind:string;poiId:string|null;evidenceIds:string[]}[]}};
const scenarios=[...development.cases.map(s=>({...s,set:'development'})),...acceptance.cases.map(s=>({...s,set:'acceptance'}))]as(Scenario&{set:string})[];
const data=readFileSync('data/pois.json');
const knownIds=new Set<string>((JSON.parse(data.toString())as Poi[]).map(p=>p.id));
const scope=new Set<string>(JSON.parse(readFileSync('data/scope-exclusions.json','utf8')).entries.map((e:{poiId:string})=>e.poiId));
const tags=new Map<string,Record<string,string>>();
for(const file of ['data/raw/overpass-astana-city.json','data/raw/overpass-astana-city-extension.json']){
 const raw=JSON.parse(readFileSync(file,'utf8'));
 for(const row of raw.response.elements??[])if(row.type&&row.id)tags.set(`osm:${row.type}/${row.id}`,row.tags??{});
}
const cuisineTokens=(raw='')=>new Set(raw.toLowerCase().split(/[;,]/).map(v=>v.trim()).flatMap(v=>v==='italian_pizza'?['italian','pizza']:v));
const matches=(poi:RuntimePoi,stage:Stage)=>Boolean((!stage.category||poi.category===stage.category)
 &&(!stage.venueType||tags.get(poi.id)?.amenity===stage.venueType)
 &&(!stage.cuisines||stage.cuisines.every(c=>cuisineTokens(tags.get(poi.id)?.cuisine).has(c))));
const categoryFor=(stage:Stage)=>stage.venueType==='restaurant'?'restaurant':stage.category;
function cuisineEvidence(poi:RuntimePoi,required:string[]){
 const tokenEvidence=new Set(poi.evidence.filter(e=>String(e.field)==='cuisine'&&e.sourceUrl===poi.sourceUrl&&e.poiId===poi.id)
  .flatMap(e=>[...cuisineTokens(typeof e.value==='string'?e.value:'')]));
 return required.every(c=>tokenEvidence.has(c));
}
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const responses=new Map<string,Promise<RuntimeResponse>>();
const records=new Map<string,Record<string,unknown>>();
let networkAttempts=0;
beforeAll(()=>{
 vi.stubEnv('APP_MODE','demo');vi.stubEnv('ALLOW_LIVE_API','false');vi.stubEnv('ROUTING_ENABLED','false');
 vi.stubEnv('LLM_PRIMARY_PROVIDER','ollama');vi.stubEnv('LLM_FALLBACK_PROVIDER','');vi.stubEnv('RETRIEVAL_PROVIDER','local');
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{networkAttempts++;throw Error('COMPOUND_OFFLINE_NETWORK_FORBIDDEN');});
});
afterAll(async()=>{
 const target=process.env.SPOT_COMPOUND_REPORT;
 if(target){
  const results=scenarios.map(s=>records.get(s.id)??{id:s.id,set:s.set,status:'failed',failedAssertions:['test_did_not_complete']});
  const report={version:'spot-compound-quality-v1',mode:'demo',dataDigest:hash(data),createdAt:new Date().toISOString(),networkAttempts,paidRequests:0,training:false,
   methodology:'Same fixed fourteen BEFORE inputs/semantic assertions, plus separate R2 stage-contract regressions. No LLM judge, no route-fit or human usefulness claim.',
   routeFitAssessment:'not_run: demo never invokes a walking provider',total:results.length,passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status!=='passed').length,results};
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2)+'\n');
 }
 vi.unstubAllEnvs();vi.restoreAllMocks();
});
function actual(scenario:Scenario){
 let result=responses.get(scenario.id);
 if(!result){result=searchPlaces(searchRequestSchema.parse(scenario.request),new AbortController().signal)as Promise<RuntimeResponse>;responses.set(scenario.id,result);}
 return result;
}
function inspect(scenario:Scenario,response:RuntimeResponse){
 const items=response.items as RuntimePoi[],stages=scenario.expected.stages??[];
 const positions=stages.map(stage=>items.findIndex(p=>matches(p,stage)));
 const assertions={
  expectedKind:scenario.expected.kinds.includes(response.kind),emptyWhenRequired:!scenario.expected.empty||items.length===0,
  mandatoryStageCoverage:positions.every(p=>p>=0),mandatoryStageOrder:!scenario.expected.ordered||positions.every((p,i)=>p>=0&&(i===0||p>positions[i-1])),
  allSelectedMatchStages:!scenario.expected.stages||items.every(p=>stages.some(stage=>matches(p,stage))),
  cuisineFieldEvidence:stages.every(stage=>!stage.cuisines||items.some(p=>matches(p,stage)&&cuisineEvidence(p,stage.cuisines!))),
  requestedFiveMinutesNotRaised:!scenario.expected.requestedMinutes||response.context.availableMinutes<=scenario.expected.requestedMinutes||response.kind==='clarification',
  clarificationCode:!scenario.expected.clarificationCode||response.clarification?.code===scenario.expected.clarificationCode,
  knownSourceIds:items.every(p=>knownIds.has(p.id)&&!scope.has(p.id)),
  evidenceMembership:items.every(p=>p.evidenceIds.every(id=>p.evidence.some(e=>e.id===id&&e.poiId===p.id))),
  noNetwork:networkAttempts===0,honestRoute:response.plan.legs.length===0&&response.plan.travelMinutes===null,
 };
 return{assertions,failedAssertions:Object.entries(assertions).filter(([,pass])=>!pass).map(([name])=>name)};
}
describe('fixed compound development and acceptance cases over the actual POI corpus',()=>{
 for(const scenario of scenarios)it(`${scenario.id}: ${scenario.purpose}`,async()=>{
  expect(hash(JSON.stringify(scenario.request)),'The public query, origin, clock and hard inputs must not change after BEFORE').toBe(scenario.beforeRequestSha256);
  const began=performance.now();
  try{
   const r=await actual(scenario),checks=inspect(scenario,r);
   records.set(scenario.id,{id:scenario.id,set:scenario.set,request:scenario.request,expected:scenario.expected,status:checks.failedAssertions.length?'failed':'passed',...checks,elapsedMs:Math.round(performance.now()-began),
    actual:{kind:r.kind,mode:r.mode,resultKind:r.resultKind,context:r.context,journey:r.journey??null,items:r.items.map(p=>({...p,photos:undefined})),plan:r.plan,clarification:r.clarification??null,warnings:r.warnings,provenance:r.provenance,diagnostics:r.diagnostics}});
   expect(checks.failedAssertions).toEqual([]);expect(r.mode).toBe('demo');
   expect(r.plan.status).toBe('unverified');expect(r.plan.totalMinutes).toBeNull();
   expect(r.items.length).toBeLessThanOrEqual(3);
   for(const p of r.items){
    for(const feature of r.context.requiredFeatures){expect(p.features[feature]).toBe(true);expect(p.evidence.some(e=>String(e.field)===feature&&e.value===true)).toBe(true);}
    expect(r.context.excludedPoiIds).not.toContain(p.id);expect(r.context.excludedCategories).not.toContain(p.category);
   }
   expect(networkAttempts).toBe(0);
  }catch(error){
   const recorded=records.get(scenario.id);
   records.set(scenario.id,{...(recorded??{id:scenario.id,set:scenario.set,request:scenario.request,expected:scenario.expected}),status:'failed',
    failedAssertions:recorded?.status==='failed'?recorded.failedAssertions:['unhandled_or_response_contract_error'],error:error instanceof Error?error.message.slice(0,300):'unknown'});
   throw error;
  }
 });
});
describe('R2 explicit journey and capability contract regressions',()=>{
 it('AND preserves both mandatory categories without inventing an order',()=>{
  const r=interpretRequest(searchRequestSchema.parse({origin:development.origins.B,query:'Хочу кофе и парк рядом'}));
  expect(r.journeyStages).toEqual([{kind:'cafe',cuisines:[]},{kind:'park',cuisines:[]}]);expect(r.journeyOrder).toBe('any');
 });
 it('OR remains alternatives rather than silently requiring both cafe and park',async()=>{
  const context=interpretRequest(searchRequestSchema.parse({origin:development.origins.B,startTime:development.clock.noon,query:'Можно кафе или парк рядом, есть 40 минут',availableMinutes:40}));
  expect(context.journeyStages).toEqual([]);
  const r=await searchPlaces(context);expect(r.items.length).toBeGreaterThan(0);expect(r.journey).toBeUndefined();
  expect(r.items.every(p=>['cafe','park','landmark'].includes(p.category))).toBe(true);expect(r.plan.legs).toEqual([]);
 });
 it('every restaurant recommendation satisfies ALL requested source cuisine facts',async()=>{
  const scenario=scenarios.find(s=>s.id==='CP-DEV-05')!,r=await actual(scenario);
  expect(r.items.length).toBeGreaterThan(0);
  for(const p of r.items as RuntimePoi[]){
   expect(p.sourceFacts?.venueType).toBe('restaurant');expect(p.sourceFacts?.cuisines).toEqual(expect.arrayContaining(['italian','pizza']));
   expect(matches(p,scenario.expected.stages![0])).toBe(true);expect(cuisineEvidence(p,['italian','pizza'])).toBe(true);
   expect(p.evidence.some(e=>String(e.field)==='venue_type'&&e.value==='restaurant'&&e.sourceUrl===p.sourceUrl)).toBe(true);
  }
 });
 it('absent Sami cuisine is not replaced with only the park stage',async()=>{
  expect([...tags.values()].some(t=>[...cuisineTokens(t.cuisine)].some(token=>['sami','saami'].includes(token)))).toBe(false);
  const r=await actual(scenarios.find(s=>s.id==='CP-ACC-01')!);expect(r.kind).toBe('no_match');expect(r.items).toEqual([]);
 });
 it('a booking action receives clarification without a claim of booking or tool call',async()=>{
  const r=await actual(scenarios.find(s=>s.id==='CP-ACC-06')!);expect(r.kind).toBe('clarification');expect(r.items).toEqual([]);
  expect(r.clarification?.code).toMatch(/booking|unsupported/);expect(networkAttempts).toBe(0);
 });
 it('the requested five minutes are preserved rather than raised to ten',async()=>{
  const r=await actual(scenarios.find(s=>s.id==='CP-ACC-03')!);expect(['no_match','clarification']).toContain(r.kind);expect(r.items).toEqual([]);
  expect(r.context.availableMinutes).toBe(5);
 });
 it('ordered stages have distinct IDs, zero-based bindings and owned evidence even without routing',async()=>{
  const scenario=scenarios.find(s=>s.id==='CP-DEV-02')!,r=await actual(scenario);
  expect(r.context.journeyStages.map(s=>s.kind)).toEqual(['cafe','park']);expect(r.context.journeyOrder).toBe('ordered');
  expect(r.journey?.status).toBe('unverified');expect(r.journey?.stages.map(s=>s.index)).toEqual([0,1]);
  expect(new Set(r.journey?.stages.map(s=>s.poiId)).size).toBe(2);
  for(const stage of r.journey?.stages??[]){const p=r.items.find(p=>p.id===stage.poiId);expect(p).toBeDefined();expect(stage.kind).toBe(categoryFor(scenario.expected.stages![stage.index]));
   expect(stage.evidenceIds.length).toBeGreaterThan(0);expect(stage.evidenceIds.every(id=>p!.evidence.some(e=>e.id===id&&e.poiId===p!.id))).toBe(true);}
  expect(r.plan.legs).toEqual([]);expect(r.plan.totalMinutes).toBeNull();
 });
 it('structured stage schema keeps defaults and rejects more than three mandatory stops',()=>{
  const normal=searchRequestSchema.parse({origin:development.origins.B});expect(normal.journeyStages).toEqual([]);expect(normal.journeyOrder).toBe('ordered');
  expect(searchRequestSchema.safeParse({origin:development.origins.B,journeyStages:[{kind:'cafe',cuisines:[]},{kind:'park',cuisines:[]}]}).success).toBe(true);
  expect(searchRequestSchema.safeParse({origin:development.origins.B,journeyStages:Array.from({length:4},()=>({kind:'park',cuisines:[]}))}).success).toBe(false);
 });
 it('Vietnamese restaurant requests retain the specific cuisine as a source constraint',()=>{
  const r=interpretRequest(searchRequestSchema.parse({origin:development.origins.G,query:'First a Vietnamese restaurant then a park',language:'en'}));
  expect(r.journeyStages).toEqual([{kind:'restaurant',cuisines:['vietnamese']},{kind:'park',cuisines:[]}]);expect(r.journeyOrder).toBe('ordered');
 });
 it('an unsupported Nordic restaurant cuisine is unverified rather than any restaurant',()=>{
  const r=interpretRequest(searchRequestSchema.parse({origin:development.origins.G,query:'Nordic restaurant then park',language:'en'}));
  expect(r.journeyStages).toEqual([{kind:'restaurant',cuisines:['unverified']},{kind:'park',cuisines:[]}]);
 });
 it('an explicit only-park follow-up replaces previous cafe and park stages',()=>{
  const r=interpretRequest(searchRequestSchema.parse({origin:development.origins.B,query:'только парк',
   journeyStages:[{kind:'cafe',cuisines:[]},{kind:'park',cuisines:[]}],journeyOrder:'ordered'}));
  expect(r.journeyStages).toEqual([{kind:'park',cuisines:[]}]);
 });
 it('a negated restaurant follow-up removes that mandatory stage but keeps the park',()=>{
  const r=interpretRequest(searchRequestSchema.parse({origin:development.origins.G,query:'не хочу ресторан',
   journeyStages:[{kind:'restaurant',cuisines:['italian','pizza']},{kind:'park',cuisines:[]}],journeyOrder:'ordered'}));
  expect(r.journeyStages).toEqual([{kind:'park',cuisines:[]}]);
 });
});
