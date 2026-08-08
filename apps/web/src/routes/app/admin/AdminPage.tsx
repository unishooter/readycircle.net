import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { AprsIsConfig } from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle, CheckboxOption, Field, TextInput } from '@readycircle/ui';
import { useAdminSettings, useAdminUsers, useSetUserAdmin, useUpdateAdminSettings } from '../../../features/admin/api.js';
import { useSession } from '../../../features/session/api.js';

export function AdminPage() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: usersData, isLoading: usersLoading } = useAdminUsers();
  const setUserAdmin = useSetUserAdmin();
  const { data: settings, isLoading: settingsLoading } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const [aprsDraft, setAprsDraft] = useState<AprsIsConfig | null>(null);

  useEffect(() => {
    if (settings?.aprs.effective) {
      setAprsDraft(settings.aprs.effective);
    }
  }, [settings?.aprs.effective]);

  // Client-side gating only for UX -- every /admin/* API route independently
  // enforces `requireAdmin` server-side regardless of what the client sends.
  if (!sessionLoading && !session?.user?.isAdmin) {
    return <Navigate to="/app" replace />;
  }

  const users = usersData?.items ?? [];
  const adminCount = users.filter((user) => user.isAdmin).length;

  async function toggleAdmin(userId: string, nextIsAdmin: boolean) {
    await setUserAdmin.mutateAsync({ userId, isAdmin: nextIsAdmin });
  }

  const inviteOverride = settings?.inviteOnlyAccess.override ?? null;
  const aprsOverride = settings?.aprs.override ?? null;

  async function saveAprs() {
    if (!aprsDraft) return;
    await updateSettings.mutateAsync({
      aprs: {
        ...aprsDraft,
        port: Number(aprsDraft.port),
      },
    });
  }

  async function resetAprs() {
    await updateSettings.mutateAsync({ aprs: null });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-ink/60">Manage admins and platform-wide settings.</p>
      </div>

      <Card>
        <CardTitle>Invite-only access</CardTitle>
        {settingsLoading || !settings ? (
          <p className="mt-3 text-sm text-ink/50">Loading…</p>
        ) : (
          <>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/60">Environment default</dt>
                <dd className="font-medium text-ink">{settings.inviteOnlyAccess.envDefault ? 'On' : 'Off'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Admin override</dt>
                <dd className="font-medium text-ink">
                  {inviteOverride === null
                    ? 'None (follows environment default)'
                    : inviteOverride
                      ? 'Forced on'
                      : 'Forced off'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-black/5 pt-2">
                <dt className="text-ink/60">Effective</dt>
                <dd className="font-medium text-ink">
                  <Badge tone={settings.inviteOnlyAccess.effective ? 'primary' : 'neutral'}>
                    {settings.inviteOnlyAccess.effective ? 'Invite-only' : 'Open sign-up'}
                  </Badge>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink/50">
              When on, new accounts can only be created with a valid Circle invite link. Existing users can always
              sign back in.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={inviteOverride === true ? 'primary' : 'secondary'}
                onClick={() => void updateSettings.mutateAsync({ inviteOnlyAccess: true })}
                disabled={updateSettings.isPending}
              >
                Force invite-only on
              </Button>
              <Button
                size="sm"
                variant={inviteOverride === false ? 'primary' : 'secondary'}
                onClick={() => void updateSettings.mutateAsync({ inviteOnlyAccess: false })}
                disabled={updateSettings.isPending}
              >
                Force invite-only off
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void updateSettings.mutateAsync({ inviteOnlyAccess: null })}
                disabled={updateSettings.isPending || inviteOverride === null}
              >
                Clear invite-only override
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>APRS-IS settings</CardTitle>
        {settingsLoading || !settings || !aprsDraft ? (
          <p className="mt-3 text-sm text-ink/50">Loading…</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-ink/50">
              {aprsOverride === null
                ? 'Currently following environment defaults. Saving stores an admin override.'
                : 'Admin override is active. Reset clears it and restores environment defaults.'}{' '}
              The Circle live map is shown when enabled and a login callsign is set. Passcode{' '}
              <code className="text-[11px]">-1</code> is receive-only.
            </p>
            <div className="mt-4 space-y-4">
              <CheckboxOption
                label="Enable APRS live tracking"
                description="When off, live maps are hidden and the worker does not ingest positions."
                checked={aprsDraft.enabled}
                onChange={(event) => setAprsDraft((draft) => (draft ? { ...draft, enabled: event.target.checked } : draft))}
              />
              <Field label="APRS-IS host" hint="Usually rotate.aprs2.net">
                {(id) => (
                  <TextInput
                    id={id}
                    value={aprsDraft.host}
                    onChange={(event) => setAprsDraft((draft) => (draft ? { ...draft, host: event.target.value } : draft))}
                  />
                )}
              </Field>
              <Field label="Port">
                {(id) => (
                  <TextInput
                    id={id}
                    type="number"
                    min={1}
                    max={65535}
                    value={aprsDraft.port}
                    onChange={(event) =>
                      setAprsDraft((draft) =>
                        draft ? { ...draft, port: Number(event.target.value) || draft.port } : draft,
                      )
                    }
                  />
                )}
              </Field>
              <Field
                label="Login callsign"
                hint="Worker identity for APRS-IS login (your ham callsign). Leave blank to keep the listener idle."
              >
                {(id) => (
                  <TextInput
                    id={id}
                    value={aprsDraft.callsign}
                    onChange={(event) =>
                      setAprsDraft((draft) => (draft ? { ...draft, callsign: event.target.value } : draft))
                    }
                    placeholder="e.g. KJ5PYB"
                    autoCapitalize="characters"
                  />
                )}
              </Field>
              <Field label="Passcode" hint="Use -1 for receive-only access.">
                {(id) => (
                  <TextInput
                    id={id}
                    value={aprsDraft.passcode}
                    onChange={(event) =>
                      setAprsDraft((draft) => (draft ? { ...draft, passcode: event.target.value } : draft))
                    }
                  />
                )}
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => void saveAprs()} disabled={updateSettings.isPending}>
                Save APRS settings
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void resetAprs()}
                disabled={updateSettings.isPending || aprsOverride === null}
              >
                Reset to env defaults
              </Button>
            </div>
            <dl className="mt-4 space-y-1 border-t border-black/5 pt-3 text-xs text-ink/50">
              <div className="flex justify-between gap-4">
                <dt>Env default</dt>
                <dd className="text-right font-medium text-ink/70">
                  {settings.aprs.envDefault.enabled ? 'on' : 'off'} · {settings.aprs.envDefault.host}:
                  {settings.aprs.envDefault.port} · {settings.aprs.envDefault.callsign || '(no callsign)'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Effective</dt>
                <dd className="text-right">
                  <Badge
                    tone={
                      settings.aprs.effective.enabled && settings.aprs.effective.callsign ? 'primary' : 'neutral'
                    }
                  >
                    {settings.aprs.effective.enabled && settings.aprs.effective.callsign
                      ? 'Live tracking on'
                      : 'Live tracking off'}
                  </Badge>
                </dd>
              </div>
            </dl>
          </>
        )}
        {updateSettings.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {(updateSettings.error as Error).message}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Users</CardTitle>
        {usersLoading ? (
          <p className="mt-3 text-sm text-ink/50">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {users.map((user) => {
              const isLastAdmin = user.isAdmin && adminCount === 1;
              return (
                <li key={user.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{user.displayName}</p>
                    <p className="text-xs text-ink/50">{user.email ?? 'No email on file'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={user.isAdmin ? 'primary' : 'neutral'}>{user.isAdmin ? 'Admin' : 'Member'}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggleAdmin(user.id, !user.isAdmin)}
                      disabled={setUserAdmin.isPending || isLastAdmin}
                      title={isLastAdmin ? 'At least one admin must always exist.' : undefined}
                    >
                      {user.isAdmin ? 'Revoke admin' : 'Make admin'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {setUserAdmin.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {(setUserAdmin.error as Error).message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
