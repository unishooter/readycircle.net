import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, TextInput } from '@readycircle/ui';
import { useDevLogin, useDevUsers, useSession } from '../../features/session/api.js';

export function DevLoginPage() {
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = useSession();
  const devAuthEnabled = session?.devAuthEnabled ?? false;
  const { data: devUsers, isLoading: usersLoading } = useDevUsers(devAuthEnabled);
  const login = useDevLogin();
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  if (session?.authenticated) {
    navigate('/app', { replace: true });
    return null;
  }

  async function loginAsExisting(userId: string) {
    await login.mutateAsync({ userId });
    navigate('/app', { replace: true });
  }

  async function createAndLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    await login.mutateAsync({ displayName: newName.trim(), email: newEmail.trim() || undefined });
    navigate('/app', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <a href="/" className="inline-flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
              RC
            </span>
            ReadyCircle
          </a>
          <h1 className="mt-4 text-2xl font-semibold text-ink">Sign in</h1>
        </div>

        {sessionLoading ? (
          <Card>
            <p className="text-sm text-ink/60">Loading…</p>
          </Card>
        ) : !devAuthEnabled ? (
          <Card>
            <p className="text-sm text-ink/70">
              Production sign-in (Google, Apple, or email) is not enabled in this environment.
              Development authentication is disabled because <code className="rounded bg-black/5 px-1">DEV_AUTH_ENABLED</code>{' '}
              is not set. See <code className="rounded bg-black/5 px-1">.env.example</code> for local setup.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">Development sign-in</h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Dev only
                </span>
              </div>
              <p className="mb-4 text-sm text-ink/60">
                Choose a seeded account, or create a brand new one. No password required in development.
              </p>

              {usersLoading ? (
                <p className="text-sm text-ink/50">Loading accounts…</p>
              ) : devUsers && devUsers.items.length > 0 ? (
                <ul className="space-y-2">
                  {devUsers.items.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => void loginAsExisting(user.id)}
                        disabled={login.isPending}
                        className="flex w-full items-center justify-between rounded-lg border border-black/10 px-4 py-3 text-left hover:border-teal-600 hover:bg-teal-50 disabled:opacity-50"
                      >
                        <span>
                          <span className="block text-sm font-medium text-ink">{user.displayName}</span>
                          {user.persona ? <span className="block text-xs text-ink/50">{user.persona}</span> : null}
                        </span>
                        <span className="text-sm text-teal-700">Continue &rarr;</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink/50">No development accounts yet -- create one below.</p>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/60">
                Create a new development user
              </h2>
              <form className="space-y-4" onSubmit={(event) => void createAndLogin(event)}>
                <Field label="Display name" required>
                  {(id) => (
                    <TextInput
                      id={id}
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="e.g. Jordan Lee"
                      required
                    />
                  )}
                </Field>
                <Field label="Email" hint="Optional -- only used for display in development.">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  )}
                </Field>
                {login.isError ? (
                  <p role="alert" className="text-sm text-red-700">
                    {(login.error as Error).message}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending ? 'Signing in…' : 'Create account & continue'}
                </Button>
              </form>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
