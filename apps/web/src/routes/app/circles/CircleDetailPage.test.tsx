import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircleResponse, MembershipResponse } from '@readycircle/contracts';
import { CircleDetailPage } from './CircleDetailPage.js';

const baseCircle: CircleResponse = {
  id: 'circle-1',
  circleType: 'neighborhood',
  circleTypeLabel: 'Neighborhood',
  name: 'Riverside Neighbors',
  circleIdentifier: 'RAV7',
  shortDescription: null,
  purpose: null,
  area: { areaLabel: 'Riverside district', gridOrLocalityLabel: null, gridIdentifier: null, gridLatitude: null, gridLongitude: null },
  isPrivate: true,
  requiresApproval: true,
  memberSharingPolicy: 'coordinators_only',
  status: 'active',
  memberCount: 2,
  coordinatorCount: 1,
  viewerRole: 'coordinator',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function makeMember(overrides: Partial<MembershipResponse> = {}): MembershipResponse {
  return {
    id: 'membership-1',
    circleId: 'circle-1',
    stationId: 'station-1',
    stationName: "Ana's Home Station",
    stationStatus: 'active',
    userId: 'user-1',
    memberDisplayName: 'Ana Rivera',
    contact: { email: null, phone: null, address: null, city: null, state: null, zip: null },
    role: 'member',
    status: 'active',
    joinedAt: '2025-01-05T00:00:00.000Z',
    ...overrides,
  };
}

let membersResult: { data?: { items: MembershipResponse[] }; isLoading: boolean } = {
  data: { items: [] },
  isLoading: false,
};

vi.mock('../../../features/circles/api.js', () => ({
  useCircle: () => ({ data: baseCircle, isLoading: false, error: null }),
  useCircleMembers: () => membersResult,
  useAddMember: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUpdateMember: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useRemoveMember: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../../../features/stations/api.js', () => ({
  useStations: () => ({ data: { items: [] } }),
}));

vi.mock('../../../features/plans/api.js', () => ({
  useCirclePlans: () => ({ data: { items: [] } }),
  useGeneratePlan: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../../../features/nets/api.js', () => ({
  useCircleNets: () => ({ data: { items: [] } }),
}));

vi.mock('../../../features/repeaters/CircleRepeatersCard.js', () => ({
  CircleRepeatersCard: () => null,
}));

vi.mock('../../../features/aprs/CircleLiveMap.js', () => ({
  CircleLiveMap: () => null,
}));

vi.mock('../../../features/plans/CircleGearSummaryCard.js', () => ({
  CircleGearSummaryCard: () => null,
}));

vi.mock('../../../features/invites/InviteCard.js', () => ({
  InviteCard: () => null,
}));

vi.mock('../../../features/contacts/CircleContactsCard.js', () => ({
  CircleContactsCard: () => null,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/circles/circle-1']}>
      <Routes>
        <Route path="/app/circles/:circleId" element={<CircleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CircleDetailPage members list', () => {
  beforeEach(() => {
    membersResult = { data: { items: [] }, isLoading: false };
  });

  it('prominently renders the Circle Identifier without ever showing the internal database id', () => {
    membersResult = { data: { items: [] }, isLoading: false };
    renderPage();
    expect(screen.getByText('Circle Identifier')).toBeInTheDocument();
    expect(screen.getByText('RAV7')).toBeInTheDocument();
    expect(screen.queryByText(baseCircle.id)).not.toBeInTheDocument();
  });

  it("shows the member's display name and station as secondary text", () => {
    membersResult = { data: { items: [makeMember()] }, isLoading: false };
    renderPage();
    expect(screen.getByText('Ana Rivera')).toBeInTheDocument();
    expect(screen.getByText(/ana's home station/i)).toBeInTheDocument();
  });

  it('shows no contact-info toggle when nothing is shared', () => {
    membersResult = { data: { items: [makeMember()] }, isLoading: false };
    renderPage();
    expect(screen.queryByRole('button', { name: /show contact info/i })).not.toBeInTheDocument();
  });

  it('reveals only the contact fields a member has shared, on demand', async () => {
    const user = userEvent.setup();
    membersResult = {
      data: {
        items: [makeMember({ contact: { email: null, phone: '555-0100', address: null, city: null, state: null, zip: null } })],
      },
      isLoading: false,
    };
    renderPage();

    expect(screen.queryByText('555-0100')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show contact info/i }));
    expect(screen.getByText('555-0100')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide contact info/i }));
    expect(screen.queryByText('555-0100')).not.toBeInTheDocument();
  });

  it('shows a show-contact-info toggle when only city/state/zip are shared', () => {
    membersResult = {
      data: {
        items: [makeMember({ contact: { email: null, phone: null, address: null, city: 'Springfield', state: 'IL', zip: '62704' } })],
      },
      isLoading: false,
    };
    renderPage();
    expect(screen.getByRole('button', { name: /show contact info/i })).toBeInTheDocument();
  });

  it('combines street, city, state, and zip into one address line', async () => {
    const user = userEvent.setup();
    membersResult = {
      data: {
        items: [
          makeMember({
            contact: { email: null, phone: null, address: '99 Birch Ln', city: 'Springfield', state: 'IL', zip: '62704' },
          }),
        ],
      },
      isLoading: false,
    };
    renderPage();

    await user.click(screen.getByRole('button', { name: /show contact info/i }));
    expect(screen.getByText('99 Birch Ln, Springfield, IL 62704')).toBeInTheDocument();
  });

  it('gracefully formats a partial address when only some parts are shared', async () => {
    const user = userEvent.setup();
    membersResult = {
      data: {
        items: [makeMember({ contact: { email: null, phone: null, address: null, city: 'Springfield', state: null, zip: null } })],
      },
      isLoading: false,
    };
    renderPage();

    await user.click(screen.getByRole('button', { name: /show contact info/i }));
    expect(screen.getByText('Springfield')).toBeInTheDocument();
  });
});
