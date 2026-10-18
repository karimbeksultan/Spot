'use client';

import { useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import type { Poi } from '@/lib/types';

type Props = { poi: Poi; large?: boolean };

/** Keep gallery state local to the place and reset it when its photo set changes. */
export default function PlacePhoto({ poi, large = false }: Props) {
  return <PhotoView key={`${poi.id}:${poi.photos.map(photo => photo.url).join('|')}`} poi={poi} large={large} />;
}

function PhotoView({ poi, large }: Props) {
  const [selectedUrl, setSelectedUrl] = useState<string>();
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set());
  const photos = poi.photos.filter((photo, index, all) =>
    !failedUrls.has(photo.url) && all.findIndex(item => item.url === photo.url) === index);
  const selectedIndex = Math.max(0, photos.findIndex(photo => photo.url === selectedUrl));
  const photo = photos[selectedIndex];
  const loaded = photo ? loadedUrls.has(photo.url) : false;
  const multiple = photos.length > 1;

  const select = (index: number) => setSelectedUrl(photos[(index + photos.length) % photos.length]?.url);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!multiple || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft') select(selectedIndex - 1);
    else if (event.key === 'ArrowRight') select(selectedIndex + 1);
    else if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(photos.length - 1);
    else return;
    event.preventDefault();
  };

  const picture = <div className={`place-photo ${large ? 'large' : ''}`} aria-busy={photo ? !loaded : undefined}>
    {photo ? <>
      {!loaded ? <div className="photo-loading" aria-hidden="true"><span />{large ? 'Загружаем фото…' : null}</div> : null}
      <img
        key={photo.url}
        src={photo.url}
        alt={photo.caption ? `${poi.name} — ${photo.caption}` : poi.name}
        className={loaded ? 'is-loaded' : 'is-loading'}
        loading={large ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedUrls(current => new Set(current).add(photo.url))}
        onError={() => setFailedUrls(current => new Set(current).add(photo.url))}
      />
    </> : <div className="photo-missing" role={large ? 'status' : undefined}>
      <ImageOff size={large ? 32 : 22} aria-hidden="true" />
      <span>{poi.photos.length ? 'Фото не загрузились' : 'Фото пока нет'}</span>
      {large && poi.photos.length ? <small>Попробуйте открыть место позже.</small> : null}
    </div>}
    {large && photo ? <span className="photo-position" role="status" aria-atomic="true">Фото {selectedIndex + 1} из {photos.length}</span> : null}
    {large && multiple ? <div className="photo-navigation">
      <button type="button" className="photo-previous" aria-label="Предыдущее фото" onClick={() => select(selectedIndex - 1)}><ChevronLeft size={23} aria-hidden="true" /></button>
      <button type="button" className="photo-next" aria-label="Следующее фото" onClick={() => select(selectedIndex + 1)}><ChevronRight size={23} aria-hidden="true" /></button>
    </div> : null}
  </div>;

  if (!large) return picture;

  return <figure className="place-gallery" role="group" aria-roledescription="галерея" aria-label={`Фотографии: ${poi.name}`} onKeyDown={handleKeyDown}>
    {picture}
    {photo ? <figcaption className="gallery-credit">
      {photo.caption ? <span className="photo-caption">{photo.caption}</span> : null}
      <span className="photo-author">{photo.attribution || photo.author}</span>
      <span className="photo-links">
        <a href={photo.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Источник фото: ${photo.author}`}>Источник</a>
        <a href={photo.licenseUrl || photo.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Лицензия фото: ${photo.license}`}>{photo.license}</a>
      </span>
    </figcaption> : null}
  </figure>;
}
