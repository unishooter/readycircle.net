import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanDetailResponse, PlanVersionDetail, PlanVersionSummary } from '@readycircle/contracts';
import { PlanDetailPage } from './PlanDetailPage.js';

const PLAN_ID = '8f8b0c9a-1234-4abc-9def-000000000001';

function makeVersionSummary(overrides: Partial<PlanVersionSummary> = {}): PlanVersionSummary {
  return {
    id: 'version-1',
    planId: PLAN_ID,
    versionNumber: 1,
    status: 'draft',
    generationStage: null,
    errorMessage: null,
    publishedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    document: null,
    scenario: null,
    ...overrides,
  };
}

let planResult: { data?: PlanDetailResponse; isLoading: boolean; error: Error | null };
let versionResult: { data?: PlanVersionDetail };

vi.mock('../../../features/plans/api.js', () => ({
  usePlan: () => planResult,
  usePlanVersion: () => versionResult,
  usePublishVersion: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useRegeneratePlan: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  planDocumentUrl: (planId: string, versionId: string) => `/api/v1/plans/${planId}/versions/${versionId}/document`,
}));

function makePlan(versions: PlanVersionSummary[], viewerCanManage = true): PlanDetailResponse {
  return {
    id: PLAN_ID,
    circleId: 'circle-1',
    circleName: 'Riverside Neighbors',
    title: 'Riverside plan',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    latestVersion: versions[0] ?? null,
    viewerCanManage,
    versions,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/app/plans/${PLAN_ID}`]}>
      <Routes>
        <Route path="/app/plans/:planId" element={<PlanDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlanDetailPage', () => {
  beforeEach(() => {
    planResult = { data: undefined, isLoading: false, error: null };
    versionResult = { data: undefined };
  });

  it('shows the generating state while a version is being generated', () => {
    const version = makeVersionSummary({ status: 'generating' });
    planResult = { data: makePlan([version]), isLoading: false, error: null };
    versionResult = { data: { ...version, sections: [] } };
    renderPage();
    expect(screen.getByText(/generating your plan/i)).toBeInTheDocument();
    // All pipeline steps are listed so the user can see what is happening.
    expect(screen.getByText(/gathering your circle/i)).toBeInTheDocument();
    expect(screen.getByText(/drafting channels, roles/i)).toBeInTheDocument();
    expect(screen.getByText(/saving the finished plan/i)).toBeInTheDocument();
  });

  it('marks earlier steps done once the generation stage advances', () => {
    const version = makeVersionSummary({ status: 'generating', generationStage: 'drafting_advisory' });
    planResult = { data: makePlan([version]), isLoading: false, error: null };
    versionResult = { data: { ...version, sections: [] } };
    renderPage();
    // Stages before drafting_advisory (context + connectivity) are done.
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('✓');
    expect(items[1]).toHaveTextContent('✓');
    expect(items[2]).not.toHaveTextContent('✓');
  });

  it('shows the failure reason and a retry button for coordinators', () => {
    const version = makeVersionSummary({ status: 'failed', errorMessage: 'model unavailable' });
    planResult = { data: makePlan([version]), isLoading: false, error: null };
    versionResult = { data: { ...version, sections: [] } };
    renderPage();
    expect(screen.getByRole('heading', { name: /generation failed/i })).toBeInTheDocument();
    expect(screen.getByText(/model unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders draft sections with a publish button for coordinators', () => {
    const version = makeVersionSummary({ status: 'draft' });
    planResult = { data: makePlan([version]), isLoading: false, error: null };
    versionResult = {
      data: {
        ...version,
        sections: [
          {
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
            },
          },
          {
            sectionKey: 'channel_plan',
            title: 'Channel plan',
            sortOrder: 2,
            content: {
              narrative: 'Use FRS channel 3.',
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
        ],
      },
    };
    renderPage();
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText(/FRS channel 3 \(462\.6125 MHz\)/)).toBeInTheDocument();
  });

  it('offers the PDF download for a published version with a ready document', () => {
    const version = makeVersionSummary({
      status: 'published',
      publishedAt: '2026-08-01T12:00:00.000Z',
      document: { format: 'pdf', status: 'ready', errorMessage: null, completedAt: '2026-08-01T12:01:00.000Z' },
    });
    planResult = { data: makePlan([version]), isLoading: false, error: null };
    versionResult = { data: { ...version, sections: [] } };
    renderPage();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
  });

  it('hides manage actions from non-coordinator members', () => {
    const version = makeVersionSummary({ status: 'draft' });
    planResult = { data: makePlan([version], false), isLoading: false, error: null };
    versionResult = { data: { ...version, sections: [] } };
    renderPage();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
  });
});
