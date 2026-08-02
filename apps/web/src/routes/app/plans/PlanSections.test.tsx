import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlanSectionResponse } from '@readycircle/contracts';
import { PlanSectionView } from './PlanSections.js';

const STATION_A = '11111111-1111-4111-8111-111111111111';
const STATION_B = '22222222-2222-4222-8222-222222222222';

function renderSection(section: PlanSectionResponse) {
  return render(<PlanSectionView section={section} />);
}

describe('PlanSections renderers', () => {
  it('shows the scenario line in the overview when present', () => {
    renderSection({
      sectionKey: 'overview',
      title: 'Overview',
      sortOrder: 0,
      content: {
        circleName: 'Riverside Neighbors',
        circleTypeLabel: 'Neighborhood Radio Circle',
        areaLabel: 'Riverside district',
        purpose: null,
        memberCount: 2,
        generatedAt: '2026-08-01T00:00:00.000Z',
        scenarioDescription: 'Citywide event: power outage; lasting up to 72 hours.',
      },
    });
    expect(screen.getByText(/citywide event: power outage/i)).toBeInTheDocument();
  });

  it('renders the connectivity section with relay verdict, stations, links, and gaps', () => {
    renderSection({
      sectionKey: 'connectivity',
      title: 'Connectivity analysis',
      sortOrder: 2,
      content: {
        narrative: 'Two stations were analyzed.',
        baselineRelay: {
          pass: false,
          summary: 'No station can relay to every edge station.',
          hubStationNames: [],
        },
        stations: [
          {
            stationId: STATION_A,
            stationName: 'Ridge Base',
            hypothetical: false,
            hasLocation: true,
            reachableStationCount: 1,
            role: 'connected',
            notes: [],
          },
          {
            stationId: STATION_B,
            stationName: 'Valley Cabin',
            hypothetical: true,
            hasLocation: true,
            reachableStationCount: 0,
            role: 'isolated',
            notes: ['No gear yet.'],
          },
        ],
        links: [
          {
            fromStationId: STATION_A,
            fromStationName: 'Ridge Base',
            toStationId: STATION_B,
            toStationName: 'Valley Cabin',
            pathType: 'repeater',
            verdict: 'marginal',
            distanceKm: 18,
            viaRepeaterName: 'Water Tower 725',
            detail: null,
          },
        ],
        gaps: ['Valley Cabin cannot reach anyone directly.'],
        repeatersConsidered: ['Water Tower 725 (GMRS)'],
      },
    });

    expect(screen.getByText(/baseline relay: gaps found/i)).toBeInTheDocument();
    expect(screen.getByText(/no station can relay to every edge station/i)).toBeInTheDocument();
    expect(screen.getByText('Ridge Base')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument(); // hypothetical badge
    expect(screen.getByText('Isolated')).toBeInTheDocument();
    expect(screen.getByText(/via repeater/i)).toBeInTheDocument();
    expect(screen.getByText(/~18 km/)).toBeInTheDocument();
    expect(screen.getByText('Marginal')).toBeInTheDocument();
    expect(screen.getByText(/valley cabin cannot reach anyone directly/i)).toBeInTheDocument();
    expect(screen.getByText(/repeaters considered: water tower 725/i)).toBeInTheDocument();
  });

  it('renders gear recommendations with priorities and target stations', () => {
    renderSection({
      sectionKey: 'gear_recommendations',
      title: 'Gear recommendations',
      sortOrder: 6,
      content: {
        narrative: 'Fill the valley gap first.',
        items: [
          {
            stationName: 'Valley Cabin',
            gap: 'No equipment yet; isolated from the Circle.',
            recommendation: '50 W GMRS mobile with a base antenna at ~20 ft',
            priority: 'essential',
          },
          {
            stationName: null,
            gap: 'No backup power anywhere.',
            recommendation: 'Battery bank sized for 72 hours of radio operation',
            priority: 'recommended',
          },
        ],
      },
    });

    expect(screen.getByText(/fill the valley gap first/i)).toBeInTheDocument();
    expect(screen.getByText('Essential')).toBeInTheDocument();
    expect(screen.getByText('Valley Cabin')).toBeInTheDocument();
    expect(screen.getByText(/50 W GMRS mobile/)).toBeInTheDocument();
    expect(screen.getByText('Circle-wide')).toBeInTheDocument();
    expect(screen.getByText(/battery bank sized for 72 hours/i)).toBeInTheDocument();
  });

  it('falls back to raw JSON for malformed section content', () => {
    renderSection({
      sectionKey: 'connectivity',
      title: 'Connectivity analysis',
      sortOrder: 2,
      content: { bogus: true },
    });
    expect(screen.getByText(/"bogus": true/)).toBeInTheDocument();
  });
});
