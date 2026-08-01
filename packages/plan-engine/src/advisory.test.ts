import { describe, expect, it } from 'vitest';
import type { PlanAdvisory } from '@readycircle/contracts';
import { buildAdvisoryUserPrompt, validateAdvisoryStationRefs } from './advisory.js';
import { makeTestContext } from './test-fixtures.js';

function makeAdvisory(assignments: PlanAdvisory['roleAssignments']['assignments']): PlanAdvisory {
  return {
    channelPlan: {
      narrative: 'Use FRS as the common channel.',
      entries: [
        {
          purpose: 'primary',
          service: 'FRS',
          channelOrFrequency: 'FRS channel 3 (462.6125 MHz)',
          whoCanUse: 'Everyone',
          notes: null,
        },
      ],
    },
    roleAssignments: { narrative: 'Assignments below.', assignments },
    checkInSchedule: {
      narrative: 'Weekly net.',
      cadence: 'Weekly',
      dayAndTime: 'Sundays at 19:00 local time',
      durationMinutes: 20,
      procedure: ['Net control opens the net.'],
    },
    recommendations: { narrative: 'Some gaps.', items: [] },
  };
}

describe('validateAdvisoryStationRefs', () => {
  const context = makeTestContext();

  it('passes valid assignments through unchanged', () => {
    const advisory = makeAdvisory([
      {
        role: 'net_control',
        stationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        stationName: 'Alpha Base',
        rationale: 'Willing and experienced.',
      },
    ]);
    expect(validateAdvisoryStationRefs(advisory, context)).toEqual(advisory);
  });

  it('drops assignments referencing stations not in the roster', () => {
    const advisory = makeAdvisory([
      {
        role: 'net_control',
        stationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        stationName: 'Alpha Base',
        rationale: 'Willing and experienced.',
      },
      {
        role: 'relay',
        stationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        stationName: 'Invented Station',
        rationale: 'Hallucinated.',
      },
    ]);
    const result = validateAdvisoryStationRefs(advisory, context);
    expect(result.roleAssignments.assignments).toHaveLength(1);
    expect(result.roleAssignments.assignments[0]!.stationId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('drops transmit-role assignments for receive-only stations', () => {
    const advisory = makeAdvisory([
      {
        role: 'net_control',
        stationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        stationName: 'Alpha Base',
        rationale: 'ok',
      },
      {
        role: 'relay',
        stationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        stationName: 'Charlie Monitor',
        rationale: 'Receive-only stations cannot relay.',
      },
    ]);
    const result = validateAdvisoryStationRefs(advisory, context);
    expect(result.roleAssignments.assignments).toHaveLength(1);
    expect(result.roleAssignments.assignments[0]!.role).toBe('net_control');
  });

  it('throws when every assignment is invalid', () => {
    const advisory = makeAdvisory([
      {
        role: 'net_control',
        stationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        stationName: 'Invented Station',
        rationale: 'Hallucinated.',
      },
    ]);
    expect(() => validateAdvisoryStationRefs(advisory, context)).toThrow(/unknown or receive-only/);
  });

  it('accepts an advisory with no assignments at all', () => {
    const advisory = makeAdvisory([]);
    expect(validateAdvisoryStationRefs(advisory, context)).toEqual(advisory);
  });
});

describe('buildAdvisoryUserPrompt', () => {
  it('embeds the full context as JSON', () => {
    const prompt = buildAdvisoryUserPrompt(makeTestContext());
    expect(prompt).toContain('Riverside Neighbors');
    expect(prompt).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(prompt).toContain('"receiveOnly": true');
  });
});
