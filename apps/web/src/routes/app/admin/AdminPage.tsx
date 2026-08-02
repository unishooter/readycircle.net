import { Navigate } from 'react-router-dom';
import { Badge, Button, Card, CardTitle } from '@readycircle/ui';
import { useAdminSettings, useAdminUsers, useSetUserAdmin, useUpdateAdminSettings } from '../../../features/admin/api.js';
import { useSession } from '../../../features/session/api.js';

export function AdminPage() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: usersData, isLoading: usersLoading } = useAdminUsers();
  const setUserAdmin = useSetUserAdmin();
  const { data: settings, isLoading: settingsLoading } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();

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

  const override = settings?.inviteOnlyAccess.override ?? null;

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
                  {override === null ? 'None (follows environment default)' : override ? 'Forced on' : 'Forced off'}
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
                variant={override === true ? 'primary' : 'secondary'}
                onClick={() => void updateSettings.mutateAsync({ inviteOnlyAccess: true })}
                disabled={updateSettings.isPending}
              >
                Force on
              </Button>
              <Button
                size="sm"
                variant={override === false ? 'primary' : 'secondary'}
                onClick={() => void updateSettings.mutateAsync({ inviteOnlyAccess: false })}
                disabled={updateSettings.isPending}
              >
                Force off
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void updateSettings.mutateAsync({ inviteOnlyAccess: null })}
                disabled={updateSettings.isPending || override === null}
              >
                Clear override
              </Button>
            </div>
            {updateSettings.isError ? (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {(updateSettings.error as Error).message}
              </p>
            ) : null}
          </>
        )}
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
