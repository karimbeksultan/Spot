import {describe,expect,it} from 'vitest';
import {astanaStartTime,formatAstanaClock} from '../../src/lib/ui-time';

describe('explicit Astana start time',()=>{
  it('leaves Now absent from the request rather than freezing a prior server clock',()=>{
    expect(astanaStartTime('')).toBeUndefined();
  });
  it('converts a selected local time with an explicit UTC+5 offset',()=>{
    const value=astanaStartTime('2026-10-19T18:30');
    expect(value).toBe('2026-10-19T18:30:00+05:00');
    expect(new Date(value!).toISOString()).toBe('2026-10-19T13:30:00.000Z');
  });
  it('handles crossing the UTC date boundary without the device timezone',()=>{
    expect(new Date(astanaStartTime('2026-01-01T00:15')!).toISOString()).toBe('2025-12-31T19:15:00.000Z');
    expect(astanaStartTime('2028-02-29T23:59')).toBe('2028-02-29T23:59:00+05:00');
  });
  it.each(['2026-02-29T12:00','2026-02-30T12:00','2026-13-01T12:00','2026-10-19T24:00','2026-10-19T12:60','2026-10-19','2026-10-19T12:00Z','2026-10-19T12:00:00+05:00'])('rejects ambiguous or impossible local input %s',value=>{
    expect(()=>astanaStartTime(value)).toThrow(RangeError);
  });
  it.each(['ru','kk','en'] as const)('displays the effective clock in Astana time in %s',language=>{
    expect(formatAstanaClock('2026-12-31T22:30:00Z',language)).toContain('03:30');
    expect(formatAstanaClock('2026-12-31T22:30:00Z',language)).toContain('2027');
  });
  it('does not render an invalid clock as a date',()=>expect(formatAstanaClock('invalid','ru')).toBe(''));
});
