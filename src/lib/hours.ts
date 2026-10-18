import { ASTANA_TIME_ZONE } from "./domain";
import type { OpeningCoverage, Poi } from "./domain";

const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: ASTANA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function localParts(date: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}
/** Resolve with IANA/Intl; no historical UTC offset is hard coded. */
function localToUtc(date: Date, minute: number): number {
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess));
    guess += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return guess;
}
type Rule = { weekdays: number[]; start: number; end: number };
function parse(raw: string): Rule[] | null {
  if (raw.trim() === "24/7") return [{ weekdays: [0, 1, 2, 3, 4, 5, 6], start: 0, end: 1440 }];
  const rules: Rule[] = [];
  for (const segment of raw.split(";")) {
    const match = segment.trim().match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+)?([0-2]\d):([0-5]\d)-([0-2]\d):([0-5]\d)$/);
    if (!match) return null; // PH, exceptions, appointment, comments, split shifts stay unknown.
    const start = +match[3] * 60 + +match[4];
    const end = +match[5] * 60 + +match[6];
    if (start >= 1440 || end > 1440 || start === end) return null;
    const weekdays: number[] = [];
    if (!match[1]) weekdays.push(0, 1, 2, 3, 4, 5, 6);
    else {
      const first = days.indexOf(match[1]); const last = days.indexOf(match[2] ?? match[1]);
      for (let i = first; ; i = (i + 1) % 7) { weekdays.push(i); if (i === last) break; }
    }
    rules.push({ weekdays, start, end: end <= start ? end + 1440 : end });
  }
  return rules;
}
export function hoursFor(poi: Poi, around: string): OpeningCoverage | null {
  if (!poi.openingHours) return null;
  const rules = parse(poi.openingHours);
  const source = poi.evidence.find((evidence) => evidence.poiId === poi.id && evidence.field === "opening_hours" && evidence.value === poi.openingHours);
  if (!rules || !source || !Number.isFinite(Date.parse(around))) return null;
  const age = Date.parse(around) - Date.parse(source.fetchedAt);
  // Freshness policy is an engineering threshold, not a claim that OSM verifies the business.
  if (!Number.isFinite(age) || age > 30 * 86_400_000 || age < -86_400_000) return null;
  const p = localParts(new Date(around));
  const intervals: { start: string; end: string }[] = [];
  // Include yesterday for overnight intervals and tomorrow for midnight crossings.
  for (let delta = -1; delta <= 2; delta++) {
    const date = new Date(Date.UTC(p.year, p.month - 1, p.day + delta));
    for (const rule of rules) if (rule.weekdays.includes(date.getUTCDay())) intervals.push({
      start: new Date(localToUtc(date, rule.start)).toISOString(), end: new Date(localToUtc(date, rule.end)).toISOString(),
    });
  }
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const merged: { start: string; end: string }[] = [];
  for (const interval of intervals.sort((a, b) => a.start.localeCompare(b.start))) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = interval.end > last.end ? interval.end : last.end;
    else merged.push({ ...interval });
  }
  return { coverageStart: new Date(localToUtc(date, 0)).toISOString(), coverageEnd: new Date(localToUtc(date, 2880)).toISOString(), intervals: merged, evidenceId: source.id };
}
