import type {UiLanguage} from './ui-copy';

/** datetime-local has no zone. Interpret it explicitly as Astana UTC+5. */
export function astanaStartTime(value:string):string|undefined {
  if(!value)return undefined;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new RangeError('Invalid local date and time');
  const iso=`${value}:00+05:00`;
  const milliseconds=Date.parse(iso);
  if(!Number.isFinite(milliseconds)||new Date(milliseconds+5*60*60*1000).toISOString().slice(0,16)!==value)throw new RangeError('Invalid local date and time');
  return iso;
}

/** Render the effective request clock independently of the device's timezone. */
export function formatAstanaClock(value:string,language:UiLanguage):string {
  const milliseconds=Date.parse(value);
  if(!Number.isFinite(milliseconds))return '';
  return new Intl.DateTimeFormat({ru:'ru-RU',kk:'kk-KZ',en:'en-GB'}[language],{
    dateStyle:'medium',timeStyle:'short',timeZone:'UTC',
  }).format(new Date(milliseconds+5*60*60*1000));
}
