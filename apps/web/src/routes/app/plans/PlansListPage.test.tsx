import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanResponse } from '@readycircle/contracts';
import { PlansListPage } from './PlansListPage.js';

let plansResult: { data?: { items: PlanResponse[] }; isLoading: boolean; error: Error | null } = {
  data: { items: [] },
  isLoading: false,
  error: null,
};

vi.mock('../../../features/plans/api.js', () => ({
  usePlans: () => plansResult,
}));

vi.mock('../../../features/circles/api.js', () => ({
  useCircles: () => ({ data: { items: [{ id: 'circle-1' }] }, isLoading: false }),
}));

function makePlan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    id: '8f8b0c9a-1234-4abc-9def-000000000001',
    circleId: 'circle-1',
    circleName: 'Riverside Neighbors',
    title: 'Riverside Neighbors communications plan',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    latestVersion: {
      id: 'version-1',
      planId: '8f8b0c9a-1234-4abc-9def-000000000001',
      versionNumber: 1,
      status: 'draft',
      errorMessage: null,
      publishedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      document: null,
    },
    viewerCanManage: true,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/plans']}>
      <PlansListPage />
    </MemoryRouter>,
  );
}

describe('PlansListPage', () => {
  beforeEach(() => {
    plansResult = { data: { items: [] }, isLoading: false, error: null };
  });

  it('shows an empty state when there are no plans', () => {
    renderPage();
    expect(screen.getByText(/no plans yet/i)).toBeInTheDocument();
    expect(screen.getByText(/generate plan/i)).toBeInTheDocument();
  });

  it('lists plans with their circle and latest version status', () => {
    plansResult = { data: { items: [makePlan()] }, isLoading: false, error: null };
    renderPage();
    expect(screen.getByText('Riverside Neighbors communications plan')).toBeInTheDocument();
    expect(screen.getByText(/draft — ready for review/i)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/app/plans/8f8b0c9a-1234-4abc-9def-000000000001');
  });

  it('shows a generating badge while the latest version is generating', () => {
    plansResult = {
      data: {
        items: [
          makePlan({
            latestVersion: {
              id: 'version-2',
              planId: '8f8b0c9a-1234-4abc-9def-000000000001',
              versionNumber: 2,
              status: 'generating',
              errorMessage: null,
              publishedAt: null,
              createdAt: '2026-08-01T00:00:00.000Z',
              document: null,
            },
          }),
        ],
      },
      isLoading: false,
      error: null,
    };
    renderPage();
    expect(screen.getByText(/generating…/i)).toBeInTheDocument();
  });
});
