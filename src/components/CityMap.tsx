'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, LocateFixed, Minus, Plus, MapPin } from 'lucide-react';
import type { Poi, SearchResponse } from '@/lib/types';
type Point={longitude:number;latitude:number};
type Props={places:Poi[];origin:Point;selectedId:string|null;onSelect:(id:string)=>void;onLocate:()=>void;onMapMove:(point:Point)=>void;onPickStart:(point:Point)=>void;pickingStart:boolean;legs:SearchResponse['plan']['legs'];focusNonce:number};
const ICON: Record<string,string>={cafe:'К',park:'П',museum:'М',landmark:'Д',playground:'И',other:'•'};

export default function CityMap({places,origin,selectedId,onSelect,onLocate,onMapMove,onPickStart,pickingStart,legs,focusNonce}:Props){
  const container=useRef<HTMLDivElement>(null);
  const map=useRef<maplibregl.Map|null>(null);
  const markers=useRef<maplibregl.Marker[]>([]);
  const startMarker=useRef<maplibregl.Marker|null>(null);
  const latest=useRef({onSelect,onMapMove,onPickStart,pickingStart});
  const [failed,setFailed]=useState(false);
  const [tilesFailed,setTilesFailed]=useState(false);
  const [ready,setReady]=useState(0);
  useEffect(()=>{latest.current={onSelect,onMapMove,onPickStart,pickingStart};},[onSelect,onMapMove,onPickStart,pickingStart]);
  useEffect(()=>{
    if(!container.current)return;
    let instance:maplibregl.Map;
    try{
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      instance=new maplibregl.Map({container:container.current,center:[origin.longitude,origin.latitude],zoom:14.2,minZoom:10,maxZoom:18,attributionControl:false,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'}},layers:[{id:'land',type:'background',paint:{'background-color':'#edf1ee'}},{id:'osm',type:'raster',source:'osm',paint:{'raster-saturation':-0.7,'raster-contrast':-0.12,'raster-brightness-min':0.1,'raster-opacity':0.84}}]}});
      map.current=instance;
      instance.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
      instance.on('load',()=>{setReady(value=>value+1);instance.resize();});
      instance.on('error',event=>{if(event.error?.message?.includes('WebGL'))setFailed(true);else setTilesFailed(true);});
      instance.on('moveend',event=>{if(event.originalEvent){const p=instance.getCenter();latest.current.onMapMove({longitude:p.lng,latitude:p.lat});}});
      instance.on('click',event=>{if(latest.current.pickingStart)latest.current.onPickStart({longitude:event.lngLat.lng,latitude:event.lngLat.lat});});
      const resize=new ResizeObserver(()=>instance.resize());resize.observe(container.current);
      return()=>{resize.disconnect();markers.current.forEach(m=>m.remove());startMarker.current?.remove();instance.remove();map.current=null;};
    }catch{queueMicrotask(()=>setFailed(true));}
    // Map lifetime is independent of state; updates below retain camera and canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    const instance=map.current;if(!instance||!ready||!instance.isStyleLoaded())return;
    markers.current.forEach(marker=>marker.remove());
    markers.current=places.map(poi=>{
      const el=document.createElement('button');el.className=`poi-marker category-${poi.category} ${poi.id===selectedId?'selected':''}`;el.setAttribute('aria-label',`Показать ${poi.name}`);el.setAttribute('aria-pressed',String(poi.id===selectedId));el.dataset.poiId=poi.id;el.title=poi.name;
      const glyph=document.createElement('span');glyph.textContent=ICON[poi.category]??'•';glyph.setAttribute('aria-hidden','true');el.appendChild(glyph);
      el.addEventListener('click',event=>{event.stopPropagation();latest.current.onSelect(poi.id);});
      return new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([poi.location.longitude,poi.location.latitude]).addTo(instance);
    });
  },[places,selectedId,ready]);
  useEffect(()=>{
    const instance=map.current;if(!instance||!ready||!instance.isStyleLoaded())return;
    startMarker.current?.remove();const el=document.createElement('div');el.className='start-marker';el.setAttribute('aria-label','Старт прогулки');el.title='Старт прогулки';
    startMarker.current=new maplibregl.Marker({element:el}).setLngLat([origin.longitude,origin.latitude]).addTo(instance);
    instance.easeTo({center:[origin.longitude,origin.latitude],zoom:14.2,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650});
  },[origin,ready]);
  useEffect(()=>{
    const instance=map.current;const poi=places.find(p=>p.id===selectedId);if(!instance||!poi||!ready)return;
    const mobileOffset=Math.max(80,(window.innerHeight-65)*0.15)-12-instance.getContainer().clientHeight/2;
    instance.easeTo({center:[poi.location.longitude,poi.location.latitude],zoom:Math.max(15,instance.getZoom()),offset:[0,window.innerWidth<768?mobileOffset:0],duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:500});
  },[selectedId,places,ready,focusNonce]);
  useEffect(()=>{
    const instance=map.current;if(!instance||!ready||!instance.isStyleLoaded())return;
    const data:FeatureCollection={type:'FeatureCollection',features:legs.flatMap(leg=>leg.geometry?[{type:'Feature' as const,properties:{},geometry:leg.geometry}]:[])};
    const source=instance.getSource('route') as maplibregl.GeoJSONSource|undefined;
    if(source)source.setData(data);else{instance.addSource('route',{type:'geojson',data});instance.addLayer({id:'route-outline',type:'line',source:'route',paint:{'line-color':'#ffffff','line-width':8},layout:{'line-join':'round','line-cap':'round'}});instance.addLayer({id:'route-path',type:'line',source:'route',paint:{'line-color':'#087363','line-width':4},layout:{'line-join':'round','line-cap':'round'}});}
    if(legs.length){const bounds=new maplibregl.LngLatBounds();legs.forEach(leg=>leg.geometry?.coordinates.forEach(p=>bounds.extend(p as [number,number])));if(!bounds.isEmpty())instance.fitBounds(bounds,{padding:{top:100,right:70,bottom:window.innerWidth<768?360:80,left:70},maxZoom:15,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:700});}
  },[legs,ready]);
  useEffect(()=>{if(map.current)map.current.getCanvas().style.cursor=pickingStart?'crosshair':'';},[pickingStart]);
  return <div className="city-map">
    <div ref={container} className="map-canvas" aria-label="Интерактивная карта Астаны"/>
    {failed?<div className="map-fallback"><Compass size={48}/><h2>Карта недоступна</h2><p>Браузер не поддерживает WebGL.<br/>Выбирайте места в списке — поиск продолжает работать.</p></div>:null}
    {tilesFailed&&!failed?<div className="tile-warning"><MapPin size={15}/>Часть карты не загрузилась. Список мест доступен.</div>:null}
    <div className="map-controls"><button onClick={()=>map.current?.zoomIn()} aria-label="Приблизить карту"><Plus size={21}/></button><button onClick={()=>map.current?.zoomOut()} aria-label="Отдалить карту"><Minus size={21}/></button><span/><button onClick={onLocate} aria-label="Моя геолокация"><LocateFixed size={21}/></button></div>
  </div>;
}
