import { describe, expect, it } from 'vitest';
import { isValidTimeZone, nextOccurrences, type NetRecurrenceRule } from './net-occurrences.js';

// 2026-08-02 is a Sunday. America/Chicago is UTC-5 (CDT) until the US DST
// transition on Sunday 2026-11-01, after which it is UTC-6 (CST).
const weeklyRule: NetRecurrenceRule = {
  frequency: 'weekly',
  firstOccursOn: '2026-08-02',
  timeLocal: '19:00',
  timezone: 'America/Chicago',
};

describe('nextOccurrences', () => {
  it('produces consecutive weekly occurrences at the local time', () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const result = nextOccurrences(weeklyRule, from, 3);
    // 19:00 CDT = 00:00 UTC the next day.
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-08-03T00:00:00.000Z',
      '2026-08-10T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
    ]);
  });

  it('skips past occurrences and starts at the first one after `from`', () => {
    const from = new Date('2026-09-15T00:00:00Z');
    const result = nextOccurrences(weeklyRule, from, 2);
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-09-21T00:00:00.000Z', // Sunday 2026-09-20 19:00 CDT
      '2026-09-28T00:00:00.000Z',
    ]);
  });

  it('keeps the local wall-clock time across the DST transition', () => {
    const from = new Date('2026-10-24T00:00:00Z');
    const result = nextOccurrences(weeklyRule, from, 3);
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-10-26T00:00:00.000Z', // Oct 25, 19:00 CDT (UTC-5)
      '2026-11-02T01:00:00.000Z', // Nov 1, 19:00 CST (UTC-6) -- DST ended that morning
      '2026-11-09T01:00:00.000Z',
    ]);
  });

  it('steps 14 days for biweekly', () => {
    const rule: NetRecurrenceRule = { ...weeklyRule, frequency: 'biweekly' };
    const from = new Date('2026-08-01T00:00:00Z');
    const result = nextOccurrences(rule, from, 3);
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-08-03T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
      '2026-08-31T00:00:00.000Z',
    ]);
  });

  it('repeats monthly on the anchor nth weekday (first Sunday)', () => {
    const rule: NetRecurrenceRule = { ...weeklyRule, frequency: 'monthly' };
    const from = new Date('2026-08-01T00:00:00Z');
    const result = nextOccurrences(rule, from, 4);
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-08-03T00:00:00.000Z', // 1st Sunday Aug = Aug 2
      '2026-09-07T00:00:00.000Z', // 1st Sunday Sep = Sep 6
      '2026-10-05T00:00:00.000Z', // 1st Sunday Oct = Oct 4
      '2026-11-02T01:00:00.000Z', // 1st Sunday Nov = Nov 1 (CST after DST)
    ]);
  });

  it('clamps a 5th-weekday monthly anchor to the last occurrence in shorter months', () => {
    // 2026-07-31 is the 5th Friday of July; August 2026 has only 4 Fridays.
    const rule: NetRecurrenceRule = {
      frequency: 'monthly',
      firstOccursOn: '2026-07-31',
      timeLocal: '12:00',
      timezone: 'UTC',
    };
    const from = new Date('2026-08-01T00:00:00Z');
    const result = nextOccurrences(rule, from, 2);
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-08-28T12:00:00.000Z', // last (4th) Friday of August
      '2026-09-25T12:00:00.000Z', // September also has 4 Fridays
    ]);
  });

  it('handles timezones east of UTC', () => {
    const rule: NetRecurrenceRule = {
      frequency: 'weekly',
      firstOccursOn: '2026-08-03', // Monday
      timeLocal: '08:30',
      timezone: 'Asia/Tokyo', // UTC+9, no DST
    };
    const from = new Date('2026-08-01T00:00:00Z');
    const result = nextOccurrences(rule, from, 2);
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-08-02T23:30:00.000Z',
      '2026-08-09T23:30:00.000Z',
    ]);
  });

  it('returns an empty list for a non-positive count', () => {
    expect(nextOccurrences(weeklyRule, new Date(), 0)).toEqual([]);
  });
});

describe('isValidTimeZone', () => {
  it('accepts real IANA zones and rejects garbage', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
