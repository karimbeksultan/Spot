'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Coffee, Compass, Footprints, Info, LocateFixed, MapPin, Navigation, Plus, RefreshCw, Route, Search, Settings2, ShieldCheck, Sparkles, Trees, X, ExternalLink, CircleHelp, LoaderCircle, RotateCcw } from 'lucide-react';
import type { Poi, SearchRequest, SearchResponse } from '@/lib/types';
import PlacePhoto from './PlacePhoto';
import DataLimits,{dataLimitsCopy} from './DataLimits';
import { categoryLabel, featureLabels, googleMapsPlaceUrl, journeyStageLabel, removeRequirementText, responseLabels, uiCopy, type UiLanguage } from '@/lib/ui-copy';
import {astanaStartTime,formatAstanaClock} from '@/lib/ui-time';

const CityMap = dynamic(() => import('./CityMap'), { ssr: false, loading: () => <div className="map-loading"><Compass size={30}/><span>Открываем карту Астаны</span></div> });
const STARTS = [
  {name:'MEGA Silk Way', longitude:71.40733, latitude:51.08909},
  {name:'Байтерек', longitude:71.4304, latitude:51.1283},
  {name:'Ботанический сад', longitude:71.4165705, latitude:51.1061652},
];
const EXAMPLES = [
  {label:'Прогулка у EXPO', icon:Footprints, text:'Я возле Mega Silk Way, есть 45 минут, хочу прогуляться и вернуться',minutes:45, start:0, back:true},
  {label:'Кофе и розетка', icon:Coffee, text:'Хочу кофе в тихом месте рядом, розетка обязательна',minutes:60,start:1,back:false},
  {label:'С ребёнком', icon:Trees, text:'Я с ребёнком, есть час, хочу что-нибудь интересное неподалёку',minutes:60,start:2,back:false},
];
type Origin = {longitude:number;latitude:number};
type Feature = 'outlets'|'wheelchair'|'indoor'|'quiet';
const distance = (metres:number) => metres < 1000 ? `${Math.round(metres / 10) * 10} м` : `${(metres / 1000).toFixed(1)} км`;

function EffectiveTime({response,language}:{response:SearchResponse;language:UiLanguage}){
  const copy=uiCopy(language);
  return <p className="effective-time"><Clock3 size={14}/><span>{response.mode==='demo'?copy.demoTime:copy.effectiveTime}: <time dateTime={response.provenance.clock}>{formatAstanaClock(response.provenance.clock,language)}</time> · Астана UTC+5</span></p>;
}

function JourneySummary({response,language,onSelect}:{response:SearchResponse;language:UiLanguage;onSelect:(id:string)=>void}){
  const copy=uiCopy(language);const stages=response.context.journeyStages;
  if(!stages.length||response.context.searchMode==='discovery')return null;
  const status=response.journey?.status??'unverified';
  return <section className={`journey-summary journey-${status}`} aria-label={copy.journey}>
    <h3>{copy.journey}</h3><p>{response.context.journeyOrder==='ordered'?copy.journeyOrdered:copy.journeyAny}</p>
    <p className="journey-status">{status==='complete'?copy.journeyComplete:status==='incomplete'?copy.journeyIncomplete:copy.journeyUnverified}</p>
    <ol>{stages.map((stage,index)=>{
      const mapping=response.journey?.stages.find(item=>item.index===index);
      const poi=response.items.find(item=>item.id===mapping?.poiId);
      return <li key={index}><strong>{journeyStageLabel(stage,language)}</strong>{poi?<button type="button" onClick={()=>onSelect(poi.id)}>{poi.name}<ArrowRight size={13}/></button>:<span>{copy.journeyMissing}</span>}</li>;
    })}</ol>
    {response.resultKind!=='itinerary'||!response.plan.legs.length?<p className="journey-route-warning">{copy.journeyRouteUnknown}</p>:null}
  </section>;
}

export default function SpotApp() {
  const [query,setQuery] = useState('');
  const [minutes,setMinutes] = useState(60);
  const [origin,setOrigin] = useState<Origin>(STARTS[2]);
  const [startLabel,setStartLabel] = useState(STARTS[2].name);
  const [returnToStart,setReturn] = useState(false);
  const [features,setFeatures] = useState<Feature[]>([]);
  const [language,setLanguage] = useState<UiLanguage>('ru');
  const [budgetKzt,setBudgetKzt] = useState<number|null>(null);
  const [strictBudget,setStrictBudget] = useState(false);
  const [startMode,setStartMode] = useState<'now'|'planned'>('now');
  const [plannedStart,setPlannedStart] = useState('');
  const [journeyStages,setJourneyStages] = useState<SearchRequest['journeyStages']>([]);
  const [journeyOrder,setJourneyOrder] = useState<SearchRequest['journeyOrder']>('ordered');
  const [confirmedOpen,setConfirmedOpen] = useState(false);
  const [excludedCategories,setExcludedCategories] = useState<string[]>([]);
  const [advanced,setAdvanced] = useState(false);
  const [nearby,setNearby] = useState<Poi[]>([]);
  const [response,setResponse] = useState<SearchResponse|null>(null);
  const [loading,setLoading] = useState(false);
  const [nearbyLoading,setNearbyLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [tab,setTab] = useState<'explore'|'plan'|'data'>('explore');
  const [help,setHelp] = useState(false);
  const [why,setWhy] = useState(false);
  const [sources,setSources] = useState(false);
  const [pickingStart,setPickingStart] = useState(false);
  const [expanded,setExpanded] = useState(false);
  const [mapCenter,setMapCenter] = useState<Origin|null>(null);
  const [mapMoved,setMapMoved] = useState(false);
  const [focusNonce,setFocusNonce] = useState(0);
  const requestRef = useRef<AbortController|null>(null);
  const sequence = useRef(0);
  const lastContext = useRef<SearchRequest|null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const results = response?.items ?? [];
  const places:Poi[] = response ? results : nearby;
  const selected = places.find(p=>p.id===selectedId) ?? nearby.find(p=>p.id===selectedId);
  const recommendation = results.find(p=>p.id===selectedId);
  const copy=uiCopy(language);
  const featureNames=featureLabels(language);
  const namedStartCopy=language==='en'?{use:'Start here',keep:'Keep selected start'}:language==='kk'?{use:'Осы жерден бастау',keep:'Таңдалған нүктені сақтау'}:{use:'Начать здесь',keep:'Оставить выбранный старт'};
  const labels=response?responseLabels(response,language):null;
  const hasCalculatedItinerary=Boolean(response?.resultKind==='itinerary'&&response.plan.legs.length&&response.plan.status==='fits_estimate'&&(!response.context.journeyStages.length||response.journey?.status==='complete'));
  const hasRequiredJourney=Boolean(response?.context.searchMode!=='discovery'&&response?.context.journeyStages.length);
  const CATEGORY=(category:Poi['category'])=>categoryLabel(category,language);

  useEffect(()=>{
    const abort = new AbortController();
    fetch('/api/pois',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:{longitude:origin.longitude,latitude:origin.latitude},radius:3500}),signal:abort.signal})
      .then(async r=>{if(!r.ok) throw new Error(); return r.json();})
      .then(data=>{if(!abort.signal.aborted){setNearby(data.items);setNearbyLoading(false);}})
      .catch(e=>{if(e.name!=='AbortError'){setNearbyLoading(false);setError('Не удалось загрузить места. Проверьте локальный сервер и повторите поиск.');}});
    return ()=>abort.abort();
  },[origin]);
  useEffect(()=>()=>requestRef.current?.abort(),[]);
  useEffect(()=>{ if(help) helpRef.current?.showModal(); else helpRef.current?.close(); },[help]);
  useEffect(()=>{ panelRef.current?.scrollTo({top:0}); },[tab,selectedId]);

  const choose = useCallback((id:string)=>{setSelectedId(id);setSources(false);setFocusNonce(n=>n+1);setExpanded(true);panelRef.current?.scrollTo({top:0,behavior:'smooth'});},[]);
  const changeOrigin = (point:Origin,label:string)=>{
    requestRef.current?.abort();sequence.current++;
    setOrigin(point);setStartLabel(label);setNearbyLoading(true);setResponse(null);setSelectedId(null);setError('');setPickingStart(false);setLoading(false);lastContext.current=null;
  };
  const invalidateForTimeChange=()=>{requestRef.current?.abort();sequence.current++;setResponse(null);setSelectedId(null);setLoading(false);setError('');setWhy(false);};
  const changeStartMode=(value:'now'|'planned')=>{invalidateForTimeChange();setStartMode(value);if(value==='now')setPlannedStart('');};
  const changePlannedStart=(value:string)=>{invalidateForTimeChange();setPlannedStart(value);};
  const locate = ()=>{
    if(!navigator.geolocation){setNotice('Геолокация недоступна. Выберите старт вручную.');return;}
    setNotice('Определяем вашу позицию…');
    navigator.geolocation.getCurrentPosition(position=>{
      const {latitude,longitude}=position.coords;
      if(latitude<50.9||latitude>51.35||longitude<71.1||longitude>71.75){setNotice('Сейчас подбор работает в Астане. Выберите точку старта в городе.');return;}
      changeOrigin({latitude,longitude},'Моя геолокация');setNotice('Старт обновлён. Координаты используются только в текущей сессии.');
    },()=>setNotice('Доступ к геолокации не получен. Выберите старт из списка или на карте.'),{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
  };
  const search = async(overrides:Partial<SearchRequest>={},text=query)=>{
    if(!text.trim()){inputRef.current?.focus();setError('Расскажите, чем хотите заняться. Можно выбрать пример ниже.');return;}
    let startTime:string|undefined;
    try{startTime=startMode==='planned'?astanaStartTime(plannedStart):undefined;if(startMode==='planned'&&!startTime)throw new RangeError();}
    catch{setError(copy.invalidStartTime);document.getElementById('planned-start')?.focus();return;}
    requestRef.current?.abort();const abort = new AbortController();requestRef.current=abort;
    const id=++sequence.current;
    setLoading(true);setError('');setSelectedId(null);setTab('explore');setWhy(false);setExpanded(true);
    const payload={...lastContext.current,query:text,origin:{longitude:origin.longitude,latitude:origin.latitude},availableMinutes:minutes,returnToStart,requiredFeatures:features,excludedCategories,confirmedOpen,language,budgetKzt,strictBudget,journeyStages,journeyOrder,excludedPoiIds:lastContext.current?.excludedPoiIds??[],keepPoiIds:[],...overrides,startTime};
    try{
      const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:abort.signal});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error || 'Поиск не ответил. Попробуйте ещё раз.');
      if(id!==sequence.current)return;
      setResponse(data);lastContext.current=data.context;
      if(data.context){setMinutes(data.context.availableMinutes);setReturn(data.context.returnToStart);setFeatures(data.context.requiredFeatures);setExcludedCategories(data.context.excludedCategories);setConfirmedOpen(data.context.confirmedOpen);setLanguage(data.context.language);setBudgetKzt(data.context.budgetKzt);setStrictBudget(data.context.strictBudget);setJourneyStages(data.context.journeyStages);setJourneyOrder(data.context.journeyOrder);}
    }catch(e){if((e as Error).name!=='AbortError'&&id===sequence.current)setError((e as Error).message || 'Не получилось выполнить поиск.');}
    finally{if(id===sequence.current)setLoading(false);}
  };
  const setBudget = (value:number)=>{
    const updatedQuery=query.replace(/\b\d+\s*(?:минут[а-яё]*|мин\.?)/giu,`${value} минут`)
      .replace(/есть\s+час(?=[\s,.!?]|$)/giu,`есть ${value} минут`)
      .replace(/(?:времени\s+)?вдвое\s+меньше|половин[ау]\s+времени/giu,`${value} минут`);
    setMinutes(value);setQuery(updatedQuery);
    if(response)void search({availableMinutes:value},updatedQuery);
  };
  const example = (index:number)=>{
    const item=EXAMPLES[index];changeOrigin(STARTS[item.start],STARTS[item.start].name);setQuery(item.text);setMinutes(item.minutes);setReturn(item.back);setFeatures([]);setConfirmedOpen(false);setExcludedCategories([]);setBudgetKzt(null);setStrictBudget(false);setStartMode('now');setPlannedStart('');setJourneyStages([]);setJourneyOrder('ordered');setTab('explore');inputRef.current?.focus();
  };
  const replace = (id:string)=>void search({excludedPoiIds:[...new Set([...(lastContext.current?.excludedPoiIds??[]),id])],keepPoiIds:results.filter(p=>p.id!==id).map(p=>p.id)},query);
  const confirmNamedStart=(candidate:NonNullable<SearchResponse['originCandidates']>[number],useAsStart:boolean)=>{
    const text=query;
    const preserved=lastContext.current;
    const selectedPoint=useAsStart?candidate.location:origin;
    const point={longitude:selectedPoint.longitude,latitude:selectedPoint.latitude};
    if(useAsStart){changeOrigin(point,candidate.name);lastContext.current=preserved;}
    void search({origin:point,originChoice:{poiId:candidate.poiId,useAsStart}},text);
  };
  const toggleFeature = (feature:Feature)=>setFeatures(current=>current.includes(feature)?current.filter(f=>f!==feature):[...current,feature]);
  const reset=()=>{requestRef.current?.abort();sequence.current++;lastContext.current=null;setQuery('');setMinutes(60);setReturn(false);setFeatures([]);setConfirmedOpen(false);setExcludedCategories([]);setBudgetKzt(null);setStrictBudget(false);setStartMode('now');setPlannedStart('');setJourneyStages([]);setJourneyOrder('ordered');setResponse(null);setSelectedId(null);setError('');setNotice('');setLoading(false);setWhy(false);setTab('explore');inputRef.current?.focus();};
  const removeFeature=(feature:Feature)=>{const requiredFeatures=features.filter(item=>item!==feature);const text=removeRequirementText(query,feature);setFeatures(requiredFeatures);setQuery(text);void search({requiredFeatures},text||'Рядом');};
  const removeOpen=()=>{const text=removeRequirementText(query,'confirmedOpen');setConfirmedOpen(false);setQuery(text);void search({confirmedOpen:false},text||'Рядом');};
  const removeStrictBudget=()=>{const text=removeRequirementText(query,'strictBudget');setStrictBudget(false);setQuery(text);void search({strictBudget:false},text||'Рядом');};
  const closeHelp=()=>{setHelp(false);helpButtonRef.current?.focus();};

  return <div className="app-shell">
    <header className="app-header">
      <Link href="/" className="brand" aria-label="spot, на главную">spot<span className="brand-mark"/></Link>
      <div className="header-divider"/>
      <span className="brand-caption">Город ближе,<br/>чем кажется</span>
      <nav className="main-nav" aria-label="Основная навигация">
        <button className={tab==='explore'?'active':''} onClick={()=>{setTab('explore');setSelectedId(null);}}><Compass size={18}/>{copy.explore}</button>
        <button className={tab==='plan'?'active':''} onClick={()=>{setTab('plan');setSelectedId(null);setExpanded(true);}}><Route size={18}/>{copy.plan}{results.length>0?<span className="nav-count">{results.length}</span>:null}</button>
        <button className={tab==='data'?'active':''} onClick={()=>{setTab('data');setSelectedId(null);setExpanded(true);}}><ShieldCheck size={18}/>{dataLimitsCopy(language).title}</button>
      </nav>
      <div className="header-location"><MapPin size={17}/><span>Астана</span><span className="country-label">Казахстан</span></div>
      <button className="icon-button help-button" ref={helpButtonRef} aria-label="О сервисе и приватности" onClick={()=>setHelp(true)}><CircleHelp size={21}/></button>
    </header>

    <main className="workspace">
      <section className="map-stage" aria-label="Карта мест">
        <CityMap places={places} origin={origin} selectedId={selectedId} onSelect={choose} onLocate={locate} onMapMove={point=>{setMapCenter(point);setMapMoved(true);}} onPickStart={point=>changeOrigin(point,'Точка на карте')} pickingStart={pickingStart} legs={response?.plan.legs??[]} focusNonce={focusNonce}/>
        <div className="map-top-label"><span className="status-dot"/><span>Маленькие открытия каждый день</span></div>
        {mapMoved && !pickingStart ? <button className="area-search" onClick={()=>{if(mapCenter){changeOrigin(mapCenter,'Центр области карты');setMapMoved(false);}}}><Search size={16}/>Искать в этой области</button>:null}
        {pickingStart ? <div className="map-instruction"><MapPin size={18}/>Нажмите на карту, чтобы выбрать старт<button aria-label="Отменить выбор старта" onClick={()=>setPickingStart(false)}><X size={18}/></button></div>:null}
        <div className="map-bottom-note"><Footprints size={16}/><span>{response?.plan.legs.length?'Пешеходный путь рассчитан. Время приблизительное.':'Выберите место. В городе всегда есть что открыть.'}</span></div>
      </section>

      <aside className={`sidebar ${expanded?'expanded':''}`} aria-label="Поиск и места">
        <button className="sheet-handle" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'Свернуть панель':'Развернуть панель'} aria-expanded={expanded}><span/></button>
        <div className="sidebar-scroll" ref={panelRef as React.RefObject<HTMLDivElement>}>
        {selected ? <section className="place-detail" key={selected.id}>
          <div className="detail-toolbar"><button className="text-button" onClick={()=>{setSelectedId(null);setSources(false);}}><ArrowLeft size={18}/>К местам</button><span>{CATEGORY(selected.category)}</span></div>
          <PlacePhoto poi={selected} large/>
          <div className="detail-content"><span className="section-kicker">На карте Астаны</span><h1>{selected.name}</h1>{selected.address?<p className="muted detail-address"><MapPin size={15}/>{selected.address}</p>:null}
          <p className="place-description">{selected.description}</p>
          {recommendation?<><div className="detail-facts"><span><Navigation size={16}/>{distance(recommendation.distanceMetres)} по прямой</span><span><Clock3 size={16}/>{recommendation.visitMinutes} мин на месте</span></div><div className="reason"><Sparkles size={18}/><div><h3>Почему подходит</h3><p>{recommendation.why}</p></div></div><h3>Что можно сделать</h3><p>{recommendation.idea}</p></>:null}
          <div className="hours"><Clock3 size={18}/><div><strong>{selected.openingHours || 'Часы работы не подтверждены'}</strong><p>{selected.openingHours?'Сведения из источника. Проверьте перед посещением.':'Перед визитом уточните, доступно ли место.'}</p></div></div>
          <a className="secondary-button external-place-check" href={googleMapsPlaceUrl(selected)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{copy.googleMaps}</a><p className="external-place-hint">{copy.googleMapsHint}</p>
          {recommendation?.warnings.map((warning,i)=><p className="inline-warning" key={i}><Info size={16}/>{warning}</p>)}
          <div className="detail-actions"><button className="primary-button" onClick={()=>{if(recommendation){setTab('plan');setSelectedId(null);}else{setQuery(`Хочу посетить ${selected.name}`);void search({},`Хочу посетить ${selected.name}`);}}}><Plus size={18}/>{recommendation?'Посмотреть план':'Подобрать план'}</button>{recommendation?<button className="secondary-button" onClick={()=>replace(selected.id)}><RefreshCw size={16}/>Заменить</button>:null}</div>
          <button className="wide-text-button" onClick={()=>{setFocusNonce(n=>n+1);setExpanded(false);}}><MapPin size={17}/>Показать на карте</button>
          <button className="disclosure-button" aria-expanded={sources} onClick={()=>setSources(!sources)}><ShieldCheck size={17}/>Источники и сведения<ChevronDown size={16}/></button>
          {sources?<div className="source-panel"><a href={selected.sourceUrl} target="_blank" rel="noreferrer">Открыть запись POI <ExternalLink size={13}/></a><p>Загружено: {new Date(selected.fetchedAt).toLocaleDateString('ru-RU')}</p><p>{selected.confirmedAt?`Подтверждено: ${new Date(selected.confirmedAt).toLocaleDateString('ru-RU')}`:'Актуальность на сегодня не подтверждена.'}</p>{selected.photos.map((photo,i)=><p key={i}><a href={photo.sourceUrl} target="_blank" rel="noreferrer">Фото: {photo.author} · {photo.license}</a></p>)}{selected.evidence.map(e=><p key={e.id}><a href={e.sourceUrl} target="_blank" rel="noreferrer">{e.field}: {String(e.value)}</a></p>)}</div>:null}
          </div>
        </section> : tab==='data'?<DataLimits language={language} onLanguageChange={setLanguage} onBack={()=>{setTab('explore');requestAnimationFrame(()=>inputRef.current?.focus());}}/> : tab==='plan' ? <section className="plan-view">
          <span className="section-kicker">Твоё время в городе</span><h1>Небольшой план.<br/>Хорошая прогулка.</h1>
          {response?<><EffectiveTime response={response} language={language}/><JourneySummary response={response} language={language} onSelect={choose}/></>:null}
          {!response || !results.length ? <div className="empty-state"><Route size={36}/><h2>Начнём с интересов</h2><p>Расскажите, чего хочется. Подберём места и проверим, сколько займёт путь.</p><button className="primary-button" onClick={()=>setTab('explore')}>Найти места<ArrowRight size={17}/></button></div>:!hasCalculatedItinerary?<div className="alternative-plan"><h2>{hasRequiredJourney?copy.journeyAlternatives:language==='kk'?'Бір орынды таңдаңыз':language==='en'?'Choose one place':'Выберите одно место'}</h2><p className="plan-notice">{hasRequiredJourney?copy.journeyRouteUnknown:language==='kk'?'Бұл — балама нұсқалар, реттелген маршрут емес. Жаяу жол мен жалпы уақыт расталмаған.':language==='en'?'These are alternatives. The walking route and total duration are unverified.':'Это альтернативы. Пеший путь и общая длительность не подтверждены; места не образуют проверенный маршрут.'}</p>{results.map(poi=><button className="alternative-place" key={poi.id} onClick={()=>choose(poi.id)}><MapPin size={17}/><span><strong>{poi.name}</strong><small>{poi.visitMinutes} мин · {CATEGORY(poi.category)}</small></span><ArrowRight size={16}/></button>)}{returnToStart?<p className="inline-warning">{copy.return}: {startLabel}. {language==='en'?'Return time unverified.':language==='kk'?'Қайту уақыты расталмаған.':'Время возврата не подтверждено.'}</p>:null}{response.plan.warnings.map((warning,i)=><p className="inline-warning" key={i}><Info size={16}/>{warning}</p>)}</div>:<>
            <div className="plan-summary"><div><strong>{response.plan.totalMinutes ? `${Math.ceil(response.plan.totalMinutes)} мин` : 'Время не проверено'}</strong><span>из доступных {minutes} минут</span></div><Footprints size={26}/></div>
            <p className="plan-notice">{response.plan.status==='fits_estimate'?'По расчёту укладывается в бюджет. Заложен резерв, время приблизительное.':response.plan.status==='too_long'?'План превышает доступное время. Увеличьте бюджет или выберите меньше мест.':'Пеший путь не подтверждён. Это список идей, выполнимость плана по времени не проверена.'}</p>
            <div className="itinerary"><div className="itinerary-start"><MapPin size={18}/><div><strong>{startLabel}</strong><small>Старт прогулки</small></div></div>{results.map((poi,i)=><button className="itinerary-stop" key={poi.id} onClick={()=>choose(poi.id)}><span className="stop-number">{i+1}</span><div><strong>{poi.name}</strong><small>{poi.visitMinutes} мин · {CATEGORY(poi.category)}</small><p>{poi.idea}</p></div><ChevronDown size={17}/></button>)}{returnToStart?<div className="itinerary-start"><RotateCcw size={18}/><div><strong>{copy.return}</strong><small>{startLabel}</small></div></div>:null}</div>
            <div className="plan-budget"><span>На месте <b>{response.plan.visitMinutes} мин</b></span><span>Переходы <b>{response.plan.travelMinutes!==null?`${Math.ceil(response.plan.travelMinutes)} мин`:'не рассчитаны'}</b></span><span>Резерв <b>{response.plan.reserveMinutes} мин</b></span></div>
            <button className="secondary-button full-width" onClick={()=>setBudget(Math.max(15,Math.round(minutes/2)))}><Clock3 size={17}/>Времени вдвое меньше</button>
            {response.plan.warnings.map((warning,i)=><p className="inline-warning" key={i}><Info size={16}/>{warning}</p>)}
          </>}
        </section> : <>
          <div className="intro"><span className="section-kicker"><span className="small-dash"/>Астана за твоё время</span><h1>{copy.title}</h1><p>{copy.intro}</p></div>
          <form onSubmit={event=>{event.preventDefault();void search();}} className="search-form">
            <div className="language-control"><label htmlFor="language">{copy.language}</label><select id="language" value={language} onChange={event=>setLanguage(event.target.value as UiLanguage)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select></div>
            {language!=='ru'?<p className="translation-note">{copy.translationNote}</p>:null}
            <label className="query-label" htmlFor="query">{copy.queryLabel}</label><div className="query-box"><textarea id="query" ref={inputRef} maxLength={1000} value={query} onChange={e=>setQuery(e.target.value)} placeholder={copy.placeholder} rows={2}/><Sparkles size={19}/></div>
            <div className="form-row-label"><label htmlFor="start">{copy.start}</label><button className="text-button" type="button" onClick={locate}><LocateFixed size={14}/>{copy.locate}</button></div>
            <div className="location-control"><MapPin size={17}/><select id="start" value={STARTS.findIndex(p=>p.name===startLabel)} onChange={e=>{const s=STARTS[Number(e.target.value)];if(s)changeOrigin(s,s.name);}}>{STARTS.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}{!STARTS.some(s=>s.name===startLabel)?<option value={-1}>{startLabel}</option>:null}</select><button type="button" aria-label="Выбрать старт на карте" onClick={()=>{setPickingStart(true);setExpanded(false);}}><MapPin size={17}/></button></div>
            <div className="form-row-label"><span id="time-label">{copy.time}</span><span className="walk-label"><Footprints size={14}/>{copy.walking}</span></div>
            <div className="time-options" role="group" aria-labelledby="time-label">{[30,45,60,90].map(value=><button key={value} type="button" aria-pressed={minutes===value} className={minutes===value?'selected':''} onClick={()=>setBudget(value)}>{value} мин</button>)}</div>
            <div className="planned-start"><label htmlFor="start-mode">{copy.startMode}</label><select id="start-mode" value={startMode} onChange={event=>changeStartMode(event.target.value as 'now'|'planned')}><option value="now">{copy.startNow}</option><option value="planned">{copy.startPlanned}</option></select>{startMode==='planned'?<><label htmlFor="planned-start">{copy.plannedStart}</label><input id="planned-start" type="datetime-local" step="60" required value={plannedStart} onChange={event=>changePlannedStart(event.target.value)} aria-describedby="start-time-help"/></>:null}<p id="start-time-help">{copy.startTimeHelp}</p></div>
            <div className="filter-row"><label className="checkbox-label"><input type="checkbox" checked={returnToStart} onChange={e=>setReturn(e.target.checked)}/>{copy.return}</label><button type="button" className={`filter-button ${advanced?'active':''}`} onClick={()=>setAdvanced(!advanced)} aria-expanded={advanced}><Settings2 size={16}/><span>{copy.filters}</span>{features.length?<b>{features.length}</b>:null}</button></div>
            {advanced?<div className="advanced-filters"><p>{copy.confirmedOnly}</p>{(['outlets','wheelchair','indoor','quiet'] as const).map(key=><label className="checkbox-label" key={key}><input type="checkbox" checked={features.includes(key)} onChange={()=>{toggleFeature(key);if(features.includes(key))setQuery(removeRequirementText(query,key));}}/>{featureNames[key]}</label>)}<label className="checkbox-label"><input type="checkbox" checked={confirmedOpen} onChange={e=>{setConfirmedOpen(e.target.checked);if(!e.target.checked)setQuery(removeRequirementText(query,'confirmedOpen'));}}/>{copy.confirmedOpen}</label><p className="muted">{copy.unknownFilter}</p><label className="budget-input" htmlFor="budget">{copy.budget}<input id="budget" type="number" min="0" max="1000000" step="100" inputMode="numeric" value={budgetKzt??''} onChange={event=>setBudgetKzt(event.target.value===''?null:Number(event.target.value))}/></label><label className="checkbox-label"><input type="checkbox" checked={strictBudget} onChange={event=>{setStrictBudget(event.target.checked);if(!event.target.checked)setQuery(removeRequirementText(query,'strictBudget'));}}/>{copy.strictBudget}</label><p className="muted">{copy.strictHelp}</p></div>:null}
            <button type="submit" className="primary-button search-submit" disabled={loading}>{loading?<><LoaderCircle size={18} className="spin"/>{copy.searching}</>:<><Search size={18}/>{copy.search}<ArrowRight size={18}/></>}</button>
            {response?<button type="button" className="reset-search text-button" onClick={reset}><RotateCcw size={14}/>{copy.reset}</button>:null}
          </form>
          {notice?<div className="notice" role="status"><Info size={17}/><p>{notice}</p><button aria-label="Скрыть сообщение" onClick={()=>setNotice('')}><X size={15}/></button></div>:null}
          {error?<div className="error-state" role="alert"><Info size={21}/><div><strong>{copy.error}</strong><p>{error}</p>{query.trim()?<button onClick={()=>void search()}>{copy.retry}</button>:null}</div></div>:null}
          {!response && !loading ? <section className="examples"><div className="section-heading"><h2>С чего начать</h2><span>Можно изменить</span></div>{EXAMPLES.map((item,i)=><button key={item.label} className="example" onClick={()=>example(i)}><span className="example-icon"><item.icon size={20}/></span><span><strong>{item.label}</strong><small>{i===0?'45 минут, с возвращением':i===1?'Тихое место для своих дел':'Что-нибудь интересное рядом'}</small></span><ArrowRight size={16}/></button>)}</section>:null}
          {loading?<div className="loading-state" role="status"><LoaderCircle size={25} className="spin"/><h2>{copy.loading}</h2><p>{copy.loadingDetail}</p><button className="text-button" onClick={()=>{requestRef.current?.abort();sequence.current++;setLoading(false);}}>{copy.cancel}</button></div>:null}
          {!loading && !error && response && labels ? <section className="results" aria-live="polite" data-outcome={response.kind}><div className="section-heading"><h2>{response.kind==='clarification'?copy.clarification:response.kind==='error'?copy.error:results.length?copy.results:copy.noMatch}</h2>{results.length?<span>{results.length}</span>:null}</div>
          <div className={`mode-label ${response.mode==='live'?'live':''}`}><ShieldCheck size={14}/>{labels.mode}</div><div className="provenance-labels"><p>{labels.data}</p><p>{labels.retrieval}</p><p>{labels.generation}</p>{results.length?<p>{!hasCalculatedItinerary?(hasRequiredJourney?copy.journeyAlternatives:language==='kk'?'Баламалар: бір орынды таңдаңыз.':language==='en'?'Alternatives: choose one place.':'Альтернативы: выберите одно место.'):(language==='kk'?'Қысқа серуен жоспары.':language==='en'?'A short walking plan.':'Короткий план прогулки.')}</p>:null}</div>
          <EffectiveTime response={response} language={language}/><JourneySummary response={response} language={language} onSelect={choose}/>
          <div className="constraint-tags" role="group" aria-label={copy.context}>
            <button onClick={()=>document.getElementById('start')?.focus()} aria-label={`${copy.start}: ${startLabel}`}><MapPin size={12}/>{startLabel}</button>
            <button onClick={()=>document.querySelector<HTMLButtonElement>('.time-options button')?.focus()} aria-label={`${copy.time}: ${minutes}`}><Clock3 size={12}/>{minutes} мин</button>
            {returnToStart?<button onClick={()=>{setReturn(false);const text=query.replace(/вернуться|вернут[ьи]ся|возврат|обратно|return(?:\s+to\s+start)?|қайту/giu,'');setQuery(text);void search({returnToStart:false},text||'Рядом');}} aria-label={`${copy.remove}: ${copy.return}`}>{copy.return}<X size={12}/></button>:null}
            {features.map(feature=><button key={feature} onClick={()=>removeFeature(feature)} aria-label={`${copy.remove}: ${featureNames[feature]}`}>{featureNames[feature]}<X size={12}/></button>)}
            {confirmedOpen?<button onClick={removeOpen} aria-label={`${copy.remove}: ${copy.confirmedOpen}`}>{copy.confirmedOpen}<X size={12}/></button>:null}
            {excludedCategories.includes('cafe')?<button onClick={()=>{const excluded=excludedCategories.filter(category=>category!=='cafe');const text=query.replace(/без\s+(кафе|кофеен|кофейн)|не\s+хочу\s+(кофе|кафе)|no\s+caf[eé]s?/giu,'');setExcludedCategories(excluded);setQuery(text);void search({excludedCategories:excluded as SearchRequest['excludedCategories']},text||'Рядом');}} aria-label={`${copy.remove}: ${copy.noCafe}`}>{copy.noCafe}<X size={12}/></button>:null}
            {strictBudget?<button onClick={removeStrictBudget} aria-label={`${copy.remove}: ${copy.strictBudget}`}>{copy.strictBudget}: {budgetKzt===null?copy.budgetUnknown:`${budgetKzt} ₸`}<X size={12}/></button>:null}
          </div>
          {response.kind==='clarification'?<div className="clarification-state"><CircleHelp size={28}/><p>{response.clarification?.question}</p><div className="origin-choice-actions">{response.originCandidates?.map(candidate=><button type="button" className="secondary-button full-width" key={candidate.poiId} onClick={()=>confirmNamedStart(candidate,true)}><MapPin size={16}/>{namedStartCopy.use}: {candidate.name}</button>)}{response.originCandidates?.length?<button type="button" className="text-button" onClick={()=>confirmNamedStart(response.originCandidates![0],false)}>{namedStartCopy.keep}</button>:null}</div>{response.clarification.code.includes('airport')?<small>{copy.airportHelp}</small>:null}</div>:response.kind==='error'?<div className="error-state" role="alert"><Info size={21}/><p>{response.error.message||copy.error}</p><button onClick={()=>void search()}>{copy.retry}</button></div>:!results.length?<div className="empty-state compact"><Search size={30}/><p>{copy.adjust}</p>{!strictBudget&&!response.context.journeyStages.length?<button className="secondary-button" onClick={()=>{setFeatures([]);setConfirmedOpen(false);setExcludedCategories([]);setQuery('Хочу прогуляться рядом');lastContext.current=null;void search({requiredFeatures:[],confirmedOpen:false,excludedCategories:[]},'Хочу прогуляться рядом');}}>{copy.relax}</button>:<p>{strictBudget?copy.strictHelp:copy.journeyEdit}</p>}</div>:results.map((poi,i)=><article className="result-card" key={poi.id}><button className="result-main" onClick={()=>choose(poi.id)}><PlacePhoto poi={poi}/><div className="result-info"><span className="category-label">{CATEGORY(poi.category)}</span><h3>{poi.name}</h3><p><Navigation size={12}/>{distance(poi.distanceMetres)} по прямой<span>·</span>{poi.visitMinutes} мин</p></div><span className="result-number">{i+1}</span></button><p className="result-reason">{poi.why}</p><div className="result-actions"><button onClick={()=>choose(poi.id)}>{copy.details}<ArrowRight size={14}/></button><button onClick={()=>replace(poi.id)} aria-label={`${copy.replace} ${poi.name}`}><RefreshCw size={13}/>{copy.replace}</button></div></article>)}
          {results.length?<><button className="primary-button full-width plan-cta" onClick={()=>setTab('plan')}><Route size={17}/>{copy.viewPlan}<ArrowRight size={17}/></button><div className="refinements"><button onClick={()=>setBudget(Math.max(15,Math.round(minutes/2)))}>{copy.lessTime}</button><button onClick={()=>{const exclusions=[...new Set([...excludedCategories,'cafe'])] as SearchRequest['excludedCategories'];setExcludedCategories(exclusions);void search({excludedCategories:exclusions});}}>{copy.noCafe}</button><button onClick={()=>void search({maxDistanceMetres:800})}>{copy.lessWalking}</button><button onClick={()=>{const text=language==='kk'?'Тек ғимарат ішінде':language==='en'?'Indoors only':'а теперь только внутри помещений';setQuery(text);void search({requiredFeatures:[...new Set([...features,'indoor' as const])]},text);}}>{copy.indoorsOnly}</button></div></>:null}
          {response.mode==='demo'?<><button className="disclosure-button" onClick={()=>setWhy(!why)} aria-expanded={why}><Info size={16}/>{copy.evidence}<ChevronDown size={16}/></button>{why?<div className="source-panel"><p>{copy.evidenceHelp}</p><p>Кандидатов после поиска: {response.diagnostics.candidateCount}</p><p>{labels.retrieval}: {response.diagnostics.retrieval}</p><p>{labels.generation}: {response.diagnostics.generation}</p><p>Время сценария: {response.provenance.clock}</p><p>Занятия и длительность посещения — предложения и оценки, не факты о месте.</p></div>:null}</>:null}
          {response.warnings.slice(0,4).map((warning,i)=><p className="inline-warning" key={i}><Info size={15}/>{warning}</p>)}
          </section>:null}
          {!response && !loading ? <section className="nearby"><div className="section-heading"><h2>Рядом со стартом</h2><span>Открой на карте</span></div>{nearbyLoading?<p className="muted">Загружаем места…</p>:nearby.slice(0,5).map(poi=><button className="nearby-place" key={poi.id} onClick={()=>choose(poi.id)}><PlacePhoto poi={poi}/><span><small>{CATEGORY(poi.category)}</small><strong>{poi.name}</strong></span><ArrowRight size={16}/></button>)}{!nearbyLoading&&!nearby.length?<p className="muted">Здесь пока нет собранных мест. Попробуйте другую область.</p>:null}</section>:null}
          <footer className="sidebar-footer"><ShieldCheck size={15}/><p>Без регистрации. Геолокация по вашему запросу.<br/><button onClick={()=>setHelp(true)}>Как работают данные и приватность</button></p></footer>
        </>}
        </div>
      </aside>
    </main>
    <dialog ref={helpRef} className="help-dialog" onCancel={closeHelp} onClick={e=>{if(e.target===e.currentTarget)closeHelp();}}><div><button className="icon-button dialog-close" onClick={closeHelp} aria-label="Закрыть информацию"><X size={22}/></button><div className="help-symbol"><Compass size={32}/></div><h2>Твой город. Твой темп.</h2><p>spot подбирает места Астаны по времени, интересам и стартовой точке. Сведения из открытых источников могут быть неполными или устаревшими.</p><h3>{copy.privacy}</h3><p>{copy.privacyBody}</p><p>{copy.noCoordinates} При открытии внешних источников действуют их правила.</p><h3>Честные ограничения</h3><p>Без подтверждённых часов или удобств мы не обещаем их наличие. Расстояния по прямой не считаются пешеходным маршрутом. Время — оценка, безопасность и доступность не гарантируются.</p>{labels?<p className="mode-label">{labels.mode}. {labels.data}. {labels.generation}.</p>:null}<button className="primary-button full-width" onClick={closeHelp}><Check size={18}/>Понятно, идём гулять</button></div></dialog>
  </div>;
}
