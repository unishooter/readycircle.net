import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircleInvitePreviewResponse, SessionResponse } from '@readycircle/contracts';
import { InvitePreviewPage } from './InvitePreviewPage.js';

let sessionResult: { data?: SessionResponse; isLoading: boolean };
let previewResult: { data?: CircleInvitePreviewResponse; isLoading: boolean };
let devUsersResult: { data?: { items: { id: string; displayName: string; email: string | null; persona: string | null }[] } };
let stationsResult: { data?: { items: { id: string; name: string; status: string }[] }; isLoading: boolean };

const devLoginMock = vi.fn();
const acceptInviteMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../features/session/api.js', () => ({
  useSession: () => sessionResult,
  useDevUsers: () => devUsersResult,
  useDevLogin: () => ({ mutateAsync: devLoginMock, isPending: false, isError: false }),
}));

vi.mock('../../features/stations/api.js', () => ({
  useStations: () => stationsResult,
}));

vi.mock('../../features/invites/api.js', () => ({
  useInvitePreview: () => previewResult,
  useAcceptInvite: () => ({ mutateAsync: acceptInviteMock, isPending: false, isError: false }),
}));

function baseSession(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    authenticated: false,
    user: null,
    devAuthEnabled: true,
    cognitoEnabled: false,
    inviteOnlyAccess: true,
    ...overrides,
  };
}

function renderPage(token = 'abc123') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePreviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvitePreviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionResult = { data: baseSession(), isLoading: false };
    previewResult = {
      data: { valid: true, circleName: 'North Ridge Neighbors', note: 'for Jane', expiresAt: '2026-08-15T00:00:00.000Z' },
      isLoading: false,
    };
    devUsersResult = { data: { items: [] } };
    stationsResult = { data: { items: [] }, isLoading: false };
  });

  it('shows an explanatory message for an invalid/expired invite', () => {
    previewResult = {
      data: { valid: false, circleName: null, note: null, expiresAt: null, reason: 'expired' },
      isLoading: false,
    };
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/expired/i);
  });

  it('shows the Circle name and note for a valid invite', () => {
    renderPage();
    expect(screen.getByText('North Ridge Neighbors')).toBeInTheDocument();
    expect(screen.getByText(/for jane/i)).toBeInTheDocument();
  });

  it('offers dev sign-up when unauthenticated, carrying the invite token through', async () => {
    const user = userEvent.setup();
    devLoginMock.mockResolvedValue({});
    renderPage('abc123');

    await user.type(screen.getByLabelText(/display name/i), 'New Neighbor');
    await user.click(screen.getByRole('button', { name: /create account & continue/i }));

    expect(devLoginMock).toHaveBeenCalledWith({ displayName: 'New Neighbor', inviteToken: 'abc123' });
  });

  it('carries the invite token through the Google sign-in link', () => {
    sessionResult = { data: baseSession({ cognitoEnabled: true }), isLoading: false };
    renderPage('abc123');
    expect(screen.getByRole('link', { name: /continue with google/i })).toHaveAttribute(
      'href',
      '/api/v1/auth/google?inviteToken=abc123',
    );
  });

  it('lets a signed-in user with an existing station join directly', async () => {
    const user = userEvent.setup();
    sessionResult = {
      data: baseSession({
        authenticated: true,
        user: {
          id: 'user-1',
          displayName: 'Returning User',
          email: null,
          emailVerified: false,
          emailVisibleToCircle: false,
          phone: null,
          phoneVisibleToCircle: false,
          address: null,
          addressVisibleToCircle: false,
          authProvider: 'dev',
          isAdmin: false,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      }),
      isLoading: false,
    };
    stationsResult = { data: { items: [{ id: 'station-1', name: 'Home base', status: 'active' }] }, isLoading: false };
    acceptInviteMock.mockResolvedValue({ circleId: 'circle-9' });
    renderPage('abc123');

    await user.click(screen.getByLabelText('Home base'));
    await user.click(screen.getByRole('button', { name: /join circle/i }));

    expect(acceptInviteMock).toHaveBeenCalledWith({ stationId: 'station-1' });
    expect(navigateMock).toHaveBeenCalledWith('/app/circles/circle-9', { replace: true });
  });

  it('deep-links to the station wizard with the invite token when creating a new station', async () => {
    const user = userEvent.setup();
    sessionResult = {
      data: baseSession({
        authenticated: true,
        user: {
          id: 'user-1',
          displayName: 'Returning User',
          email: null,
          emailVerified: false,
          emailVisibleToCircle: false,
          phone: null,
          phoneVisibleToCircle: false,
          address: null,
          addressVisibleToCircle: false,
          authProvider: 'dev',
          isAdmin: false,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      }),
      isLoading: false,
    };
    stationsResult = { data: { items: [] }, isLoading: false };
    renderPage('abc123');

    await user.click(screen.getByRole('button', { name: /create a new station/i }));
    expect(navigateMock).toHaveBeenCalledWith('/app/stations/new?inviteToken=abc123');
  });
});
