import { describe, expect, it } from 'vitest';
import { featureLabels, googleMapsPlaceUrl, journeyStageLabel, removeRequirementText, responseLabels, uiCopy } from '../../src/lib/ui-copy';
import { interpretRequest, searchRequestSchema, type SearchResponse } from '../../src/lib/types';

describe('explicit constraint editing', () => {
  it.each([['ru','Ресторан · итальянская кухня'],['kk','Мейрамхана · итальян асханасы'],['en','Restaurant · Italian cuisine']] as const)('labels required restaurant cuisine in %s', (language,label)=>{
    expect(journeyStageLabel({kind:'restaurant',cuisines:['italian']},language)).toBe(label);
    expect(uiCopy(language).journeyAny).toBeTruthy();
    expect(uiCopy(language).journeyIncomplete).toBeTruthy();
  });
  it('removes indoor hard wording while preserving the time and return condition', () => {
    const query=removeRequirementText('45 минут, только внутри помещений, вернуться к старту', 'indoor');
    const context=interpretRequest(searchRequestSchema.parse({query,origin:{longitude:71.40733,latitude:51.08909}}));
    expect(context.requiredFeatures).not.toContain('indoor');
    expect(context.availableMinutes).toBe(45);
    expect(context.returnToStart).toBe(true);
  });
  it('removes an outlet requirement without changing the requested category', () => {
    expect(removeRequirementText('Хочу кофе, розетка обязательна', 'outlets')).toBe('Хочу кофе,');
    expect(removeRequirementText('Обязательно с розеткой', 'outlets')).toBe('');
  });
  it('keeps essential action and feature copy available in all three languages', () => {
    for (const language of ['ru', 'kk', 'en'] as const) {
      expect(uiCopy(language).search.length).toBeGreaterThan(3);
      expect(uiCopy(language).clarification.length).toBeGreaterThan(3);
      expect(Object.keys(featureLabels(language))).toHaveLength(4);
    }
    expect(uiCopy('kk').search).toBe('Орын табу');
    expect(uiCopy('en').search).toBe('Find a place');
  });
  it('does not confuse real snapshot data with disabled generation', () => {
    const labels=responseLabels({mode:'degraded',provenance:{dataSource:'real_snapshot',retrieval:'snapshot-lexical',generation:'nvidia-validated',clock:'2026-10-18T08:00:00Z'}} as SearchResponse,'ru');
    expect(labels.data).toContain('реальные POI');
    expect(labels.mode).toBe('Ограниченный режим');
    expect(labels.retrieval).not.toContain('вектор');
    expect(labels.generation).toBe('Генерация с проверкой фактов');
  });
  it('labels a real local hybrid index as vector retrieval with validated local generation', () => {
    const labels=responseLabels({mode:'live',provenance:{dataSource:'real_snapshot',retrieval:'local-hybrid',generation:'ollama-validated',clock:'2026-10-18T08:00:00Z'}} as SearchResponse,'ru');
    expect(labels.retrieval).toContain('векторный');
    expect(labels.data).toContain('сохранённые реальные POI');
    expect(labels.generation).toBe('Генерация с проверкой фактов');
  });
  it.each(['Хочу кофе, не более 1000 ₸','Coffee under 1000 KZT','бюджет қатаң'])('removing a strict budget chip cannot silently add it again: %s', original => {
    const context=interpretRequest(searchRequestSchema.parse({query:removeRequirementText(original,'strictBudget'),origin:{longitude:71.40733,latitude:51.08909},strictBudget:false}));
    expect(context.strictBudget).toBe(false);
  });
  it.each(['Хочу ночную прогулку','night walk','түнгі серуен','open now'])('removing confirmed-open also clears automatic night wording: %s', original => {
    const context=interpretRequest(searchRequestSchema.parse({query:removeRequirementText(original,'confirmedOpen'),origin:{longitude:71.40733,latitude:51.08909},confirmedOpen:false}));
    expect(context.confirmedOpen).toBe(false);
  });
  it.each([
    ['quiet','I need a quiet place'],['quiet','quiet mandatory'],['quiet','Тыныштық міндетті'],
    ['wheelchair','Арбамен қолжетімді орын керек'],['wheelchair','need wheelchair access'],
    ['outlets','mandatory outlet'],['outlets','socket needed'],['outlets','I must have a power outlet'],
  ] as const)('removes %s chip without multilingual extraction adding it back: %s',(feature,query)=>{
    const original=interpretRequest(searchRequestSchema.parse({query,origin:{longitude:71.40733,latitude:51.08909}}));
    expect(original.requiredFeatures).toContain(feature);
    const edited=interpretRequest({...original,query:removeRequirementText(query,feature),requiredFeatures:original.requiredFeatures.filter(value=>value!==feature)});
    expect(edited.requiredFeatures).not.toContain(feature);
  });
  it('removing an outlet preserves the separate quiet requirement',()=>{
    const query=removeRequirementText('I need a quiet place with an outlet required','outlets');
    const context=interpretRequest(searchRequestSchema.parse({query,origin:{longitude:71.40733,latitude:51.08909}}));
    expect(context.requiredFeatures).toContain('quiet');
    expect(context.requiredFeatures).not.toContain('outlets');
  });
  it('Google Maps search uses public place identity without a key or user origin',()=>{
    const url=new URL(googleMapsPlaceUrl({name:'Кофе & друзья',address:'Кабанбай батыра, 12',location:{latitude:51.12,longitude:71.42}}));
    expect(url.origin+url.pathname).toBe('https://www.google.com/maps/search/');
    expect([...url.searchParams.keys()]).toEqual(['api','query']);
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('Кофе & друзья, Астана, Кабанбай батыра, 12');
    expect(url.searchParams.has('origin')).toBe(false);
    expect(url.searchParams.has('key')).toBe(false);
  });
  it('an unnamed public POI can use its own coordinates for external verification',()=>{
    const url=new URL(googleMapsPlaceUrl({name:'Без названия',address:null,location:{latitude:51.12,longitude:71.42}}));
    expect(url.searchParams.get('query')).toBe('51.12,71.42');
    expect([...url.searchParams.keys()]).toEqual(['api','query']);
  });
  it.each(['Парк без названия (OSM way/123)','Скамейка (OSM node/123)'])('derived OSM labels use public coordinates rather than inventing a place name: %s',name=>{
    const url=new URL(googleMapsPlaceUrl({name,address:null,location:{latitude:51.12,longitude:71.42}}));
    expect(url.searchParams.get('query')).toBe('51.12,71.42');
    expect(url.searchParams.get('query')).not.toContain('OSM');
  });
  it('preserves actual names that merely contain the word OSM',()=>{
    const url=new URL(googleMapsPlaceUrl({name:'Кофейня OSM',address:null,location:{latitude:51.12,longitude:71.42}}));
    expect(url.searchParams.get('query')).toBe('Кофейня OSM, Астана');
  });
  it('bounds Unicode values to the documented Maps URL size limit',()=>{
    const url=googleMapsPlaceUrl({name:'📍'.repeat(400),address:'📍'.repeat(1000),location:{latitude:51.12,longitude:71.42}});
    expect(url.length).toBeLessThanOrEqual(2048);
  });
});
