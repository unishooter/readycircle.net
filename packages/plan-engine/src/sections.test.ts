import { describe, expect, it } from 'vitest';
import { planOverviewContentSchema, planRosterContentSchema } from '@readycircle/contracts';
import { buildOverviewContent, buildRosterContent } from './sections.js';
import { makeTestContext } from './test-fixtures.js';

describe('buildOverviewContent', () => {
  it('transcribes circle facts and member count', () => {
    const overview = buildOverviewContent(makeTestContext());
    expect(overview).toEqual({
      circleName: 'Riverside Neighbors',
      circleTypeLabel: 'Neighborhood Radio Circle',
      areaLabel: 'Riverside district',
      purpose: 'Welfare checks during storms and outages.',
      memberCount: 3,
      generatedAt: '2026-08-01T12:00:00.000Z',
      scenarioDescription:
        'Citywide event: power outage, no cellular coverage, no internet; lasting up to 72 hours.',
    });
    expect(planOverviewContentSchema.parse(overview)).toEqual(overview);
  });
});

describe('buildRosterContent', () => {
  it('produces one entry per member matching the contract schema', () => {
    const roster = buildRosterContent(makeTestContext());
    expect(roster.entries).toHaveLength(3);
    expect(planRosterContentSchema.parse(roster)).toEqual(roster);

    const alpha = roster.entries[0]!;
    expect(alpha.stationName).toBe('Alpha Base');
    expect(alpha.gridIdentifier).toBe('16SBK7308');
    expect(alpha.willingToActAsNetControl).toBe(true);

    const charlie = roster.entries[2]!;
    expect(charlie.receiveOnly).toBe(true);
    expect(charlie.gridIdentifier).toBeNull();
  });

  it('never includes coordinates or private operator details', () => {
    const roster = buildRosterContent(makeTestContext());
    for (const entry of roster.entries) {
      expect(entry).not.toHaveProperty('latitude');
      expect(entry).not.toHaveProperty('longitude');
      expect(entry).not.toHaveProperty('experienceLevel');
      expect(entry).not.toHaveProperty('authorization');
      expect(entry).not.toHaveProperty('goals');
    }
  });
});
