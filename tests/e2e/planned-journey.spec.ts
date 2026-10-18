import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {interpretRequest,searchRequestSchema,type Poi,type SearchRequest,type SearchResponse} from '../../src/lib/types';

// Explicit UI fixtures only. Actual local model/routing checks are separate evidence.
test.use({timezoneId:'America/New_York'});
const source=JSON.parse(readFileSync('data/pois.json','utf8')) as Poi[];
const cafe=source.find(poi=>poi.category==='cafe')!;
const park=source.find(poi=>poi.category==='park')!;
const stages:SearchRequest['journeyStages']=[{kind:'cafe',cuisines:[]},{kind:'park',cuisines:[]}];
type Options={stages?:SearchRequest['journeyStages'];order?:SearchRequest['journeyOrder'];status?:'complete'|'unverified'|'incomplete';kind?:'recommendations'|'no_match'|'clarification';route?:boolean;title?:string;clock?:string};
function fixture(payload:unknown,options:Options={}):SearchResponse{
  const context=interpretRequest(searchRequestSchema.parse(payload));
  context.startTime=context.startTime??options.clock??'2026-10-18T08:00:00Z';
  if(options.stages)context.journeyStages=options.stages;
  if(options.order)context.journeyOrder=options.order;
  const kind=options.kind??'recommendations';
  const selected=kind==='recommendations'?(context.journeyStages.length?[cafe,park]:[cafe]):[];
  const items=selected.map((poi,index)=>({...poi,name:options.title??poi.name,why:'UI fixture over a saved real POI.',idea:'UI fixture idea.',visitMinutes:10,evidenceIds:[poi.evidence[0].id],distanceMetres:100+index*100,openingStatus:'unknown' as const,warnings:[]}));
  return {mode:'live',kind,resultKind:options.route?'itinerary':'alternatives',context,items,
    plan:{status:options.route?'fits_estimate':'unverified',visitMinutes:items.length*10,travelMinutes:options.route?10:null,reserveMinutes:5,totalMinutes:options.route?35:null,returnToStart:context.returnToStart,warnings:[],legs:options.route?selected.map((poi,index)=>({fromId:index?selected[index-1].id:'start',toId:poi.id,profile:'walking',seconds:300,metres:300,provider:'Explicit UI fixture'})):[]},
    warnings:[],diagnostics:{candidateCount:2,retrieval:'snapshot-lexical',generation:'template'},provenance:{dataSource:'real_snapshot',retrieval:'snapshot-lexical',generation:'template',clock:context.startTime},
    ...(context.journeyStages.length?{journey:{status:options.status??'unverified',stages:context.journeyStages.map((stage,index)=>({index,kind:stage.kind,poiId:kind==='recommendations'?selected[index]?.id??null:null,evidenceIds:selected[index]?[selected[index].evidence[0].id]:[]}))}}:{}),
    ...(kind==='clarification'?{clarification:{code:'unsupported_day_plan',question:'Уточните короткую прогулку: весь день и бронирование пока не поддерживаются.',fields:['availableMinutes']}}:{}),
  } as SearchResponse;
}
async function open(page:Page){
  await page.route('**/api/pois',route=>route.fulfill({json:{mode:'snapshot',items:[cafe,park],warnings:[]}}));
  await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('.nearby-place').first()).toBeVisible();
}
async function submit(page:Page){
  const response=page.waitForResponse(response=>response.url().endsWith('/api/search')&&response.request().method()==='POST');
  await page.locator('.search-submit').click();await response;await expect(page.locator('.loading-state')).toHaveCount(0);await expect(page.locator('.results')).toBeVisible();
}

test('Now never inherits the previous effective server clock on a follow-up',async({page})=>{
  const requests:Record<string,unknown>[]=[];
  await page.route('**/api/search',route=>{const payload=route.request().postDataJSON();requests.push(payload);return route.fulfill({json:fixture(payload,{clock:requests.length===1?'2026-10-18T08:00:00Z':'2026-10-18T09:00:00Z'})});});
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Покажи место рядом');await submit(page);
  await expect(page.locator('.effective-time time')).toContainText('13:00');
  await page.getByLabel('Ваши планы и пожелания').fill('А теперь ещё одно место');await submit(page);
  expect(requests).toHaveLength(2);expect(requests[0]).not.toHaveProperty('startTime');expect(requests[1]).not.toHaveProperty('startTime');
  await expect(page.locator('.effective-time time')).toContainText('14:00');
});

test('planned Astana time is explicit in POST and display regardless of device timezone; Now and reset clear it',async({page})=>{
  const requests:Record<string,unknown>[]=[];
  await page.route('**/api/search',route=>{const payload=route.request().postDataJSON();requests.push(payload);return route.fulfill({json:fixture(payload)});});
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Покажи место рядом');
  await page.getByLabel('Когда начинаем',{exact:true}).selectOption('planned');await page.getByLabel('Дата и время старта в Астане',{exact:true}).fill('2026-10-19T18:30');await submit(page);
  expect(requests[0].startTime).toBe('2026-10-19T18:30:00+05:00');await expect(page.locator('.effective-time time')).toContainText('18:30');
  expect(new URL(page.url()).search).toBe('');expect(await page.evaluate(()=>localStorage.length)).toBe(0);
  await page.getByLabel('Когда начинаем',{exact:true}).selectOption('now');await expect(page.locator('.results')).toHaveCount(0);await submit(page);expect(requests[1]).not.toHaveProperty('startTime');
  await page.getByRole('button',{name:'Новый поиск',exact:true}).click();await expect(page.getByLabel('Когда начинаем',{exact:true})).toHaveValue('now');await expect(page.locator('#planned-start')).toHaveCount(0);
});

test('changing planned time cancels a stale request and its late result cannot replace the new result',async({page})=>{
  let calls=0;const requests:Record<string,unknown>[]=[];
  await page.route('**/api/search',async route=>{const payload=route.request().postDataJSON();requests.push(payload);const call=++calls;if(call===1)await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({json:fixture(payload,{title:call===1?'Старый ответ':'Новый ответ'})}).catch(()=>{});});
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Покажи место рядом');await page.getByLabel('Когда начинаем',{exact:true}).selectOption('planned');await page.locator('#planned-start').fill('2026-10-19T10:00');
  await page.locator('.search-submit').click();await expect.poll(()=>calls).toBe(1);await page.locator('#planned-start').fill('2026-10-19T11:00');await submit(page);
  await expect(page.locator('.result-card h3')).toHaveText('Новый ответ');await page.waitForTimeout(1200);await expect(page.locator('.result-card h3')).toHaveText('Новый ответ');
  expect(requests[1].startTime).toBe('2026-10-19T11:00:00+05:00');await expect(page.locator('.effective-time time')).toContainText('11:00');
});

test('ordered required stages map to POIs and persist through an ordinary indoor follow-up',async({page})=>{
  const requests:SearchRequest[]=[];
  await page.route('**/api/search',route=>{const payload=route.request().postDataJSON();requests.push(payload);return route.fulfill({json:fixture(payload,{stages,order:'ordered',status:requests.length===1?'complete':'incomplete',kind:requests.length===1?'recommendations':'no_match',route:requests.length===1})});});
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Сначала кофе, потом парк, есть 40 минут');await submit(page);
  const summary=page.getByRole('region',{name:'Обязательные этапы',exact:true});await expect(summary).toContainText('В указанном порядке');await expect(summary).toContainText('Все этапы сопоставлены');
  await expect(summary.locator('li>strong')).toHaveText(['Кофе','Парк']);await expect(summary.locator('li>button')).toHaveText([cafe.name,park.name]);
  await page.getByRole('button',{name:'Посмотреть план',exact:true}).click();await expect(page.locator('.plan-summary')).toBeVisible();await expect(page.locator('.itinerary-stop strong')).toHaveText([cafe.name,park.name]);await expect(page.locator('.effective-time')).toBeVisible();
  await page.getByRole('button',{name:'Исследовать',exact:true}).click();await page.getByLabel('Ваши планы и пожелания').fill('а теперь только внутри помещений');await submit(page);
  expect(requests[1].journeyStages).toEqual(stages);expect(requests[1].journeyOrder).toBe('ordered');await expect(summary).toContainText('Не все этапы выполнены');await expect(page.getByRole('button',{name:'Посмотреть места без ограничений'})).toHaveCount(0);
});

test('any order still requires every stage and an incomplete result is not shown as a ready itinerary',async({page})=>{
  await page.route('**/api/search',route=>route.fulfill({json:fixture(route.request().postDataJSON(),{stages,order:'any',status:'incomplete',kind:'no_match'})}));
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Кофе и парк');await submit(page);
  const summary=page.getByRole('region',{name:'Обязательные этапы',exact:true});await expect(summary).toContainText('Все этапы обязательны; порядок свободный');await expect(summary).toContainText('Не все этапы выполнены');await expect(summary.locator('li')).toHaveCount(2);
  await expect(page.locator('.plan-summary')).toHaveCount(0);await expect(page.getByRole('button',{name:'Посмотреть места без ограничений'})).toHaveCount(0);await expect(page.locator('.empty-state.compact')).toContainText('Измените запрос');
});

test('matched stages without walking legs remain unverified and new stage/time labels support KK and EN',async({page})=>{
  const restaurantStages:SearchRequest['journeyStages']=[{kind:'restaurant',cuisines:['italian']},{kind:'park',cuisines:[]}];
  await page.route('**/api/search',route=>route.fulfill({json:fixture(route.request().postDataJSON(),{stages:restaurantStages,order:'ordered',status:'unverified'})}));
  await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Сначала итальянский ресторан, потом парк');await submit(page);await page.getByRole('button',{name:'Посмотреть план',exact:true}).click();
  await expect(page.locator('.plan-summary')).toHaveCount(0);await expect(page.locator('.alternative-plan')).toContainText('Пеший путь и общая длительность не подтверждены');
  await page.getByRole('button',{name:'Исследовать',exact:true}).click();await page.locator('#language').selectOption('kk');await expect(page.getByRole('region',{name:'Міндетті кезеңдер',exact:true})).toContainText('Мейрамхана · итальян асханасы');await expect(page.getByLabel('Қашан бастаймыз',{exact:true})).toBeVisible();
  await page.locator('#language').selectOption('en');await expect(page.getByRole('region',{name:'Required stages',exact:true})).toContainText('Restaurant · Italian cuisine');await expect(page.getByLabel('When to start',{exact:true})).toBeVisible();await expect(page.locator('.effective-time')).toContainText('Start time used for calculation');
});

test('a new non-airport clarification code displays the server question without airport guidance',async({page})=>{
  await page.route('**/api/search',route=>route.fulfill({json:fixture(route.request().postDataJSON(),{kind:'clarification'})}));await open(page);await page.getByLabel('Ваши планы и пожелания').fill('Хочу план на весь день');await submit(page);
  await expect(page.locator('.clarification-state')).toContainText('весь день и бронирование');await expect(page.locator('.clarification-state small')).toHaveCount(0);await expect(page.getByRole('button',{name:'Посмотреть места без ограничений'})).toHaveCount(0);await expect(page.locator('.effective-time')).toBeVisible();
});

test('planned datetime and required stage mapping fit mobile without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.route('**/api/search',route=>route.fulfill({json:fixture(route.request().postDataJSON(),{stages,order:'ordered',status:'unverified'})}));await open(page);
  await page.getByRole('button',{name:'Развернуть панель'}).click();await page.getByLabel('Ваши планы и пожелания').fill('Сначала кофе, потом парк');await page.getByLabel('Когда начинаем',{exact:true}).selectOption('planned');await page.locator('#planned-start').fill('2026-10-19T18:30');await submit(page);
  await expect(page.getByRole('region',{name:'Обязательные этапы',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#planned-start').evaluate(node=>node.getBoundingClientRect().right<=innerWidth)).toBe(true);
});
