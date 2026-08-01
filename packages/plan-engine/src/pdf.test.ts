import { describe, expect, it } from 'vitest';
import { renderPlanPdf } from './pdf.js';
import { buildOverviewContent, buildRosterContent } from './sections.js';
import { makeTestContext } from './test-fixtures.js';

describe('renderPlanPdf', () => {
  it('renders a valid PDF from typical section content', async () => {
    const context = makeTestContext();
    const bytes = await renderPlanPdf({
      planTitle: 'Riverside Neighbors communications plan',
      circleName: 'Riverside Neighbors',
      versionNumber: 1,
      publishedAt: '2026-08-01T12:00:00.000Z',
      sections: [
        { sectionKey: 'overview', title: 'Overview', content: buildOverviewContent(context) },
        { sectionKey: 'roster', title: 'Station roster', content: buildRosterContent(context) },
        {
          sectionKey: 'channel_plan',
          title: 'Channel plan',
          content: {
            narrative: 'FRS channel 3 is the common channel.',
            entries: [
              {
                purpose: 'primary',
                service: 'FRS',
                channelOrFrequency: 'FRS channel 3 (462.6125 MHz)',
                whoCanUse: 'All stations',
                notes: null,
              },
            ],
          },
        },
        {
          sectionKey: 'check_in_schedule',
          title: 'Check-in schedule',
          content: {
            narrative: 'Weekly practice net.',
            cadence: 'Weekly',
            dayAndTime: 'Sundays at 19:00 local time',
            durationMinutes: 20,
            procedure: ['Net control opens the net.', 'Stations check in alphabetically.'],
          },
        },
      ],
    });

    expect(bytes.byteLength).toBeGreaterThan(500);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('falls back to raw JSON for unknown or malformed section content', async () => {
    const bytes = await renderPlanPdf({
      planTitle: 'Plan',
      circleName: 'Circle',
      versionNumber: 2,
      publishedAt: null,
      sections: [
        { sectionKey: 'overview', title: 'Overview', content: { unexpected: 'shape' } },
        { sectionKey: 'mystery_section', title: 'Mystery', content: { hello: 'world' } },
      ],
    });
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });
});
