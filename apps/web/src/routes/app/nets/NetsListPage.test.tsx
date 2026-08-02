import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetResponse } from '@readycircle/contracts';
import { NetsListPage } from './NetsListPage.js';

let netsResult: { data?: { items: NetResponse[] }; isLoading: boolean; error: Error | null } = {
  data: { items: [] },
  isLoading: false,
  error: null,
};

vi.mock('../../../features/nets/api.js', () => ({
  useNets: () => netsResult,
}));

vi.mock('../../../features/circles/api.js', () => ({
  useCircles: () => ({ data: { items: [{ id: 'circle-1' }] }, isLoading: false }),
}));

export function makeNet(overrides: Partial<NetResponse> = {}): NetResponse {
  return {
    id: '8f8b0c9a-1234-4abc-9def-000000000010',
    circleId: 'circle-1',
    circleName: 'Riverside Neighbors',
    name: 'Sunday Evening Net',
    description: null,
    channel: 'FRS channel 3 (462.6125 MHz)',
    schedule: {
      frequency: 'weekly',
      frequencyLabel: 'Weekly',
      firstOccursOn: '2026-08-02',
      timeLocal: '19:00',
      timezone: 'America/Chicago',
      durationMinutes: 30,
    },
    procedure: [],
    status: 'active',
    sourcePlanVersionId: null,
    nextOccurrences: ['2026-08-03T00:00:00.000Z'],
    viewerCanManage: true,
    viewerCanRunSession: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/nets']}>
      <NetsListPage />
    </MemoryRouter>,
  );
}

describe('NetsListPage', () => {
  beforeEach(() => {
    netsResult = { data: { items: [] }, isLoading: false, error: null };
  });

  it('shows an empty state when there are no nets', () => {
    renderPage();
    expect(screen.getByText(/no nets scheduled yet/i)).toBeInTheDocument();
  });

  it('lists nets with circle, channel, and next occurrence', () => {
    netsResult = { data: { items: [makeNet()] }, isLoading: false, error: null };
    renderPage();
    expect(screen.getByText('Sunday Evening Net')).toBeInTheDocument();
    expect(screen.getByText(/riverside neighbors/i)).toBeInTheDocument();
    expect(screen.getByText(/next:/i)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/nets/8f8b0c9a-1234-4abc-9def-000000000010');
  });
});
