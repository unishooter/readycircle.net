import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserSummary, PlatformSettingsResponse, SessionResponse } from '@readycircle/contracts';
import { AdminPage } from './AdminPage.js';

let sessionResult: { data?: SessionResponse; isLoading: boolean };
let usersResult: { data?: { items: AdminUserSummary[] }; isLoading: boolean };
let settingsResult: { data?: PlatformSettingsResponse; isLoading: boolean };

const setUserAdminMock = vi.fn();
const updateSettingsMock = vi.fn();

vi.mock('../../../features/session/api.js', () => ({
  useSession: () => sessionResult,
}));

vi.mock('../../../features/admin/api.js', () => ({
  useAdminUsers: () => usersResult,
  useSetUserAdmin: () => ({ mutateAsync: setUserAdminMock, isPending: false, isError: false }),
  useAdminSettings: () => settingsResult,
  useUpdateAdminSettings: () => ({ mutateAsync: updateSettingsMock, isPending: false, isError: false }),
}));

function adminSession(): SessionResponse {
  return {
    authenticated: true,
    user: {
      id: 'admin-1',
      displayName: 'Admin User',
      email: null,
      emailVerified: false,
      authProvider: 'dev',
      isAdmin: true,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    devAuthEnabled: true,
    cognitoEnabled: false,
    inviteOnlyAccess: false,
  };
}

function makeUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: 'user-1',
    displayName: 'Some User',
    email: 'user@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PlatformSettingsResponse['inviteOnlyAccess']> = {}): PlatformSettingsResponse {
  return { inviteOnlyAccess: { envDefault: false, override: null, effective: false, ...overrides } };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/admin']}>
      <Routes>
        <Route path="/app/admin" element={<AdminPage />} />
        <Route path="/app" element={<p>Redirected home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionResult = { data: adminSession(), isLoading: false };
    usersResult = { data: { items: [makeUser({ id: 'admin-1', displayName: 'Admin User', isAdmin: true }), makeUser()] }, isLoading: false };
    settingsResult = { data: makeSettings(), isLoading: false };
  });

  it('redirects non-admins away from the page', () => {
    sessionResult = {
      data: { ...adminSession(), user: { ...adminSession().user!, isAdmin: false } },
      isLoading: false,
    };
    renderPage();
    expect(screen.getByText('Redirected home')).toBeInTheDocument();
  });

  it('lists users with their admin status', () => {
    renderPage();
    const adminRow = screen.getByText('Admin User').closest('li');
    const memberRow = screen.getByText('Some User').closest('li');
    expect(adminRow).not.toBeNull();
    expect(memberRow).not.toBeNull();
    expect(adminRow!.textContent).toContain('Admin');
    expect(memberRow!.textContent).toContain('Member');
  });

  it('promotes a member to admin', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /make admin/i }));
    expect(setUserAdminMock).toHaveBeenCalledWith({ userId: 'user-1', isAdmin: true });
  });

  it('disables revoking admin from the last remaining admin', () => {
    usersResult = { data: { items: [makeUser({ id: 'admin-1', displayName: 'Admin User', isAdmin: true })] }, isLoading: false };
    renderPage();
    expect(screen.getByRole('button', { name: /revoke admin/i })).toBeDisabled();
  });

  it('shows the effective invite-only-access setting and lets an admin force it on', async () => {
    const user = userEvent.setup();
    settingsResult = { data: makeSettings(), isLoading: false };
    renderPage();

    expect(screen.queryByText('Invite-only')).not.toBeInTheDocument();
    expect(screen.getByText('Open sign-up')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /force on/i }));
    expect(updateSettingsMock).toHaveBeenCalledWith({ inviteOnlyAccess: true });
  });

  it('lets an admin clear the override', async () => {
    const user = userEvent.setup();
    settingsResult = { data: makeSettings({ override: true, effective: true }), isLoading: false };
    renderPage();

    expect(screen.getByText('Forced on')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear override/i }));
    expect(updateSettingsMock).toHaveBeenCalledWith({ inviteOnlyAccess: null });
  });
});
