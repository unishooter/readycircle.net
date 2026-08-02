import { describe, expect, it } from 'vitest';
import type { PlanVersionDetail } from '@readycircle/contracts';
import { prefillFromPlanVersion } from './plan-prefill.js';

function makeVersion(sections: PlanVersionDetail['sections']): PlanVersionDetail {
  return {
    id: 'version-1',
    planId: 'plan-1',
    versionNumber: 1,
    status: 'published',
    generationStage: null,
    errorMessage: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    document: null,
    sections,
  };
}

describe('prefillFromPlanVersion', () => {
  it('parses cadence, day/time, duration, procedure, and primary channel', () => {
    const version = makeVersion([
      {
        title: 'Check-in schedule',
        sectionKey: 'check_in_schedule',
        sortOrder: 4,
        content: {
          narrative: 'Practice weekly.',
          cadence: 'Weekly',
          dayAndTime: 'Sundays at 19:00 local time',
          durationMinutes: 20,
          procedure: ['Open the net', 'Take check-ins'],
        },
      },
      {
        title: 'Channel plan',
        sectionKey: 'channel_plan',
        sortOrder: 2,
        content: {
          narrative: 'Use FRS.',
          entries: [
            {
              purpose: 'backup',
              service: 'FRS',
              channelOrFrequency: 'FRS channel 7',
              whoCanUse: 'Everyone',
              notes: null,
            },
            {
              purpose: 'primary',
              service: 'FRS',
              channelOrFrequency: 'FRS channel 3 (462.6125 MHz)',
              whoCanUse: 'Everyone',
              notes: null,
            },
          ],
        },
      },
    ]);

    const prefill = prefillFromPlanVersion(version, 'Riverside Neighbors');
    expect(prefill.name).toBe('Riverside Neighbors net');
    expect(prefill.frequency).toBe('weekly');
    expect(prefill.timeLocal).toBe('19:00');
    expect(prefill.durationMinutes).toBe(20);
    expect(prefill.procedure).toEqual(['Open the net', 'Take check-ins']);
    expect(prefill.channel).toBe('FRS channel 3 (462.6125 MHz) (FRS)');
    // First occurrence lands on the named weekday (Sunday = 0).
    expect(prefill.firstOccursOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [year, month, day] = prefill.firstOccursOn!.split('-').map(Number);
    expect(new Date(year!, month! - 1, day!).getDay()).toBe(0);
  });

  it('parses 12-hour times and biweekly/monthly cadences', () => {
    const version = makeVersion([
      {
        title: 'Check-in schedule',
        sectionKey: 'check_in_schedule',
        sortOrder: 4,
        content: {
          narrative: '',
          cadence: 'Every other week',
          dayAndTime: 'Wednesdays at 7:30 PM',
          durationMinutes: 30,
          procedure: [],
        },
      },
    ]);
    const prefill = prefillFromPlanVersion(version, 'Test Circle');
    expect(prefill.frequency).toBe('biweekly');
    expect(prefill.timeLocal).toBe('19:30');
  });

  it('leaves unparsable fields undefined instead of guessing', () => {
    const version = makeVersion([
      {
        title: 'Check-in schedule',
        sectionKey: 'check_in_schedule',
        sortOrder: 4,
        content: {
          narrative: '',
          cadence: 'Whenever the mood strikes',
          dayAndTime: 'At dusk',
          durationMinutes: 15,
          procedure: [],
        },
      },
    ]);
    const prefill = prefillFromPlanVersion(version, 'Test Circle');
    expect(prefill.frequency).toBeUndefined();
    expect(prefill.timeLocal).toBeUndefined();
    expect(prefill.firstOccursOn).toBeUndefined();
    expect(prefill.durationMinutes).toBe(15);
  });
});
