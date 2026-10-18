import { describe, expect, it } from 'vitest';
import { journeyCombinations, matchesStage } from '../../src/lib/journey';
import { interpretRequest, searchRequestSchema, type Poi } from '../../src/lib/types';

const origin = { longitude: 71.4165705, latitude: 51.1061652 };
const interpret = (query: string, overrides: Record<string, unknown> = {}) => interpretRequest(searchRequestSchema.parse({ origin, query, availableMinutes: 60, ...overrides }));
const kinds = (query: string) => interpret(query).journeyStages.map((stage) => stage.kind);

describe('meal and walk intent without venue names', () => {
  it.each([
    ['поесть и погулять', ['restaurant', 'park']],
    ['Хочу покушать и прогуляться', ['restaurant', 'park']],
    ['Хочу перекусить и погулять в парке', ['restaurant', 'park']],
    ['Хочу погулять, затем поесть', ['park', 'restaurant']],
    ['Хочу поесть и парк рядом', ['restaurant', 'park']],
  ])('keeps both requested activities for %s', (query, expected) => {
    expect(kinds(query)).toEqual(expected);
  });

  it.each([
    'Хочу перекусить в кафе и погулять',
    'Хочу кофе и прогуляться',
    'Хочу попить кофе и пойти в парк',
  ])('uses an explicit café instead of adding another meal venue: %s', (query) => {
    expect(kinds(query)).toEqual(['cafe', 'park']);
  });

  it('uses one restaurant when it is already explicit', () => {
    const context = interpret('Хочу поесть в итальянском ресторане и погулять');
    expect(context.journeyStages).toEqual([{ kind: 'restaurant', cuisines: ['italian'] }, { kind: 'park', cuisines: [] }]);
  });

  it.each(['Хочу погулять', 'Хочу прогуляться', 'Поесть или погулять'])('does not turn a single walk or alternatives into two hard stops: %s', (query) => {
    expect(kinds(query)).toEqual([]);
  });

  it.each([
    'Не хочу поесть и погулять',
    'Не буду перекусить и погулять',
    'Хочу поесть, но не хочу погулять',
    'Без кафе хочу погулять',
    'Не хочу в кафе, хочу погулять',
    'Поесть не хочу, хочу погулять',
    'Не хочу ни поесть ни погулять',
    'Не предлагай перекусить и погулять',
    'Не хочу поесть и прогуляться, хочу кофе',
    'Не хочу поесть и кофе, хочу погулять',
    'Хочу поесть, но не хочу погулять в парке',
    'Хочу поесть и не хочу прогуляться в парке',
  ])('does not infer a mandatory positive pair from a negated activity: %s', (query) => {
    expect(kinds(query)).toEqual([]);
  });

  it('starts a new affirmative clause after a declined meal', () => {
    expect(kinds('Не хочу поесть, хочу кофе и прогуляться')).toEqual(['cafe', 'park']);
  });

  it('keeps an explicitly declined park out of a meal plan', () => {
    const context = interpret('Хочу поесть и погулять, но без парка');
    expect(context.journeyStages.some((stage) => stage.kind === 'park')).toBe(false);
  });

  it('preserves the existing time, return, feature and cuisine requirements', () => {
    const context = interpret('Хочу поесть и погулять', { availableMinutes: 30, returnToStart: true, requiredFeatures: ['outlets'],
      journeyStages: [{ kind: 'restaurant', cuisines: ['italian', 'pizza'] }], journeyOrder: 'ordered', confirmedOpen: true });
    expect(context.availableMinutes).toBe(30);
    expect(context.returnToStart).toBe(true);
    expect(context.requiredFeatures).toEqual(['outlets']);
    expect(context.confirmedOpen).toBe(true);
    expect(context.journeyOrder).toBe('ordered');
    expect(context.journeyStages).toEqual([{ kind: 'restaurant', cuisines: ['italian', 'pizza'] }, { kind: 'park', cuisines: [] }]);
  });

  it('does not invent a cuisine when the request does not specify one', () => {
    expect(interpret('поесть и погулять').journeyStages[0]).toEqual({ kind: 'restaurant', cuisines: [] });
  });

  it('requires source restaurant evidence and keeps the complete pair when no meal venue is confirmed', () => {
    const context = interpret('поесть и погулять');
    const base = { description: 'Explicit synthetic unit fixture, not a real venue', location: origin,
      features: { outlets: null, wheelchair: null, indoor: null, quiet: null }, hours: null, openingHours: null,
      address: null, photos: [], sourceUrl: 'https://example.org/synthetic-meal-intent-fixture',
      fetchedAt: '2026-10-18T12:00:00Z', confirmedAt: null, contentHash: 'synthetic-fixture' };
    const categoryEvidence = (id: string, category: string) => ({ id: `${id}:category`, poiId: id, field: 'category' as const, value: category,
      sourceUrl: base.sourceUrl, fetchedAt: base.fetchedAt, confirmedAt: null });
    const park: Poi = { ...base, id: 'public-test-park', name: 'Synthetic park', category: 'park', evidence: [categoryEvidence('public-test-park', 'park')] };
    const unverifiedMeal: Poi = { ...base, id: 'public-test-meal', name: 'Synthetic restaurant', category: 'other',
      sourceFacts: { venueType: 'restaurant', cuisines: [] }, evidence: [categoryEvidence('public-test-meal', 'other')] };
    expect(matchesStage(unverifiedMeal, context.journeyStages[0])).toBe(false);
    expect(journeyCombinations([unverifiedMeal, park], context, [])).toEqual([]);
    expect(context.journeyStages.map((stage) => stage.kind)).toEqual(['restaurant', 'park']);
    const confirmedMeal = { ...unverifiedMeal, evidence: [...unverifiedMeal.evidence,
      { ...categoryEvidence(unverifiedMeal.id, 'other'), id: `${unverifiedMeal.id}:venue`, field: 'venue_type' as const, value: 'restaurant' }] };
    expect(journeyCombinations([confirmedMeal, park], context, []).map((places) => places.map((poi) => poi.id))).toEqual([[confirmedMeal.id, park.id]]);
  });
});
