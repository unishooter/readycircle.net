import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserSummary, AprsIsConfig, PlatformSettingsResponse, SessionResponse } from '@readycircle/contracts';
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

const defaultAprs: AprsIsConfig = {
  enabled: true,
  host: 'rotate.aprs2.net',
  port: 14580,
  callsign: '',
  passcode: '-1',
};

function adminSession(): SessionResponse {
  return {
    authenticated: true,
    user: {
      id: 'admin-1',
      displayName: 'Admin User',
      email: null,
      emailVerified: false,
      contactEmail: null,
      emailVisibleToCircle: false,
      phone: null,
      phoneVisibleToCircle: false,
      address: null,
      city: null,
      state: null,
      zip: null,
      addressVisibleToCircle: false,
      authProvider: 'dev',
      isAdmin: true,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    devAuthEnabled: true,
    cognitoEnabled: false,
    inviteOnlyAccess: false,
    aprsEnabled: false,
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

function makeSettings(
  overrides: {
    inviteOnlyAccess?: Partial<PlatformSettingsResponse['inviteOnlyAccess']>;
    aprs?: Partial<PlatformSettingsResponse['aprs']>;
  } = {},
): PlatformSettingsResponse {
  return {
    inviteOnlyAccess: { envDefault: false, override: null, effective: false, ...overrides.inviteOnlyAccess },
    aprs: {
      envDefault: defaultAprs,
      override: overrides.aprs?.override ?? null,
      effective: { ...defaultAprs, ...overrides.aprs?.effective },
    },
  };
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

    await user.click(screen.getByRole('button', { name: /force invite-only on/i }));
    expect(updateSettingsMock).toHaveBeenCalledWith({ inviteOnlyAccess: true });
  });

  it('lets an admin clear the invite-only override', async () => {
    const user = userEvent.setup();
    settingsResult = {
      data: makeSettings({ inviteOnlyAccess: { override: true, effective: true } }),
      isLoading: false,
    };
    renderPage();

    expect(screen.getByText('Forced on')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear invite-only override/i }));
    expect(updateSettingsMock).toHaveBeenCalledWith({ inviteOnlyAccess: null });
  });

  it('saves APRS-IS settings from the form', async () => {
    const user = userEvent.setup();
    settingsResult = { data: makeSettings(), isLoading: false };
    renderPage();

    await user.clear(screen.getByLabelText(/login callsign/i));
    await user.type(screen.getByLabelText(/login callsign/i), 'KI5ABC');
    await user.click(screen.getByRole('button', { name: /save aprs settings/i }));

    expect(updateSettingsMock).toHaveBeenCalledWith({
      aprs: expect.objectContaining({
        enabled: true,
        host: 'rotate.aprs2.net',
        port: 14580,
        callsign: 'KI5ABC',
        passcode: '-1',
      }),
    });
  });

  it('resets APRS settings to env defaults when an override exists', async () => {
    const user = userEvent.setup();
    const override: AprsIsConfig = {
      enabled: false,
      host: 'custom.aprs.net',
      port: 14580,
      callsign: 'N0CALL',
      passcode: '-1',
    };
    settingsResult = {
      data: makeSettings({
        aprs: { override, effective: override },
      }),
      isLoading: false,
    };
    renderPage();

    await user.click(screen.getByRole('button', { name: /reset to env defaults/i }));
    expect(updateSettingsMock).toHaveBeenCalledWith({ aprs: null });
  });
});
