import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, TextInput } from '@readycircle/ui';
import { useDevLogin, useDevUsers, useSession } from '../../features/session/api.js';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Sign-in was cancelled.',
  oauth_failed: "Something went wrong signing you in. Please try again, or use a different sign-in option.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Both production sign-in options are plain full-page navigations to the
 * API, not fetch calls -- Cognito's OAuth redirect flow needs a real
 * browser navigation, and this way the frontend never needs an OAuth SDK
 * or to see a Cognito/Google token.
 */
function ProductionSignIn() {
  return (
    <Card>
      <a
        href="/api/v1/auth/google"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-sm hover:bg-black/5"
      >
        <GoogleIcon />
        Continue with Google
      </a>
      <div className="my-4 flex items-center gap-3 text-xs text-ink/40">
        <span className="h-px flex-1 bg-black/10" />
        or
        <span className="h-px flex-1 bg-black/10" />
      </div>
      <a
        href="/api/v1/auth/login"
        className="flex w-full items-center justify-center rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium text-ink/70 hover:bg-black/5"
      >
        Continue with email
      </a>
    </Card>
  );
}

function DevSignIn() {
  const { data: devUsers, isLoading: usersLoading } = useDevUsers(true);
  const login = useDevLogin();
  const navigate = useNavigate();
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

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
    <>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">Development sign-in</h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Dev only</span>
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/60">Create a new development user</h2>
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
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: session, isLoading: sessionLoading } = useSession();

  if (session?.authenticated) {
    navigate('/app', { replace: true });
    return null;
  }

  const errorCode = searchParams.get('error');
  const errorMessage = errorCode ? (OAUTH_ERROR_MESSAGES[errorCode] ?? OAUTH_ERROR_MESSAGES.oauth_failed) : null;

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

        {errorMessage ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {sessionLoading ? (
          <Card>
            <p className="text-sm text-ink/60">Loading…</p>
          </Card>
        ) : (
          <>
            {session?.cognitoEnabled ? <ProductionSignIn /> : null}
            {session?.devAuthEnabled ? <DevSignIn /> : null}
            {!session?.cognitoEnabled && !session?.devAuthEnabled ? (
              <Card>
                <p className="text-sm text-ink/70">
                  Sign-in is not configured in this environment. See{' '}
                  <code className="rounded bg-black/5 px-1">docs/deployment/cognito-google-setup.md</code> or{' '}
                  <code className="rounded bg-black/5 px-1">.env.example</code> for local setup.
                </p>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
