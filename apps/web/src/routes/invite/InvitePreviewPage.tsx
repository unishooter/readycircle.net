import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardTitle, Field, RadioOption, TextInput } from '@readycircle/ui';
import { useDevLogin, useDevUsers, useSession } from '../../features/session/api.js';
import { useStations } from '../../features/stations/api.js';
import { useAcceptInvite, useInvitePreview } from '../../features/invites/api.js';
import logoHorizontal from '../../assets/readycircle-logo-horizontal.png';

const INVALID_REASON_MESSAGES: Record<string, string> = {
  not_found: "This invite link doesn't exist. Ask for a new one.",
  expired: 'This invite link has expired. Ask for a new one.',
  revoked: 'This invite link was revoked by the person who created it.',
  accepted: 'This invite link has already been used.',
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

function SignInToJoin({ token }: { token: string }) {
  const { data: session } = useSession();
  const { data: devUsers } = useDevUsers(Boolean(session?.devAuthEnabled));
  const login = useDevLogin();
  const [newName, setNewName] = useState('');

  async function createAndLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    await login.mutateAsync({ displayName: newName.trim(), inviteToken: token });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">Sign in or create an account to join.</p>
      {session?.cognitoEnabled ? (
        <Card>
          <a
            href={`/api/v1/auth/google?inviteToken=${encodeURIComponent(token)}`}
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
            href={`/api/v1/auth/login?inviteToken=${encodeURIComponent(token)}`}
            className="flex w-full items-center justify-center rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium text-ink/70 hover:bg-black/5"
          >
            Continue with email
          </a>
        </Card>
      ) : null}
      {session?.devAuthEnabled ? (
        <>
          {devUsers && devUsers.items.length > 0 ? (
            <Card>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/60">
                Sign in with an existing development account
              </h2>
              <ul className="space-y-2">
                {devUsers.items.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => void login.mutateAsync({ userId: user.id })}
                      disabled={login.isPending}
                      className="flex w-full items-center justify-between rounded-lg border border-black/10 px-4 py-3 text-left hover:border-navy-600 hover:bg-navy-50 disabled:opacity-50"
                    >
                      <span className="text-sm font-medium text-ink">{user.displayName}</span>
                      <span className="text-sm text-navy-700">Continue &rarr;</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/60">
              Create a new development account
            </h2>
            <form className="space-y-4" onSubmit={(event) => void createAndLogin(event)}>
              <Field label="Display name" required>
                {(id) => (
                  <TextInput id={id} value={newName} onChange={(event) => setNewName(event.target.value)} required />
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
      ) : null}
    </div>
  );
}

function JoinAsSignedInUser({ token }: { token: string }) {
  const navigate = useNavigate();
  const { data: stationsData, isLoading } = useStations();
  const acceptInvite = useAcceptInvite(token);
  const [selectedStationId, setSelectedStationId] = useState('');

  const stations = (stationsData?.items ?? []).filter((s) => s.status === 'active' || s.status === 'hypothetical');

  async function handleJoinWithExisting() {
    if (!selectedStationId) return;
    const result = await acceptInvite.mutateAsync({ stationId: selectedStationId });
    navigate(`/app/circles/${result.circleId}`, { replace: true });
  }

  if (isLoading) return <p className="text-sm text-ink/50">Loading your stations…</p>;

  return (
    <div className="space-y-4">
      {stations.length > 0 ? (
        <Card>
          <CardTitle>Join with an existing station</CardTitle>
          <div className="mt-3 space-y-2">
            {stations.map((station) => (
              <RadioOption
                key={station.id}
                name="station"
                label={station.name}
                value={station.id}
                checked={selectedStationId === station.id}
                onChange={() => setSelectedStationId(station.id)}
              />
            ))}
          </div>
          {acceptInvite.isError ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {(acceptInvite.error as Error).message}
            </p>
          ) : null}
          <Button className="mt-4" onClick={() => void handleJoinWithExisting()} disabled={!selectedStationId || acceptInvite.isPending}>
            {acceptInvite.isPending ? 'Joining…' : 'Join Circle'}
          </Button>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{stations.length > 0 ? 'Or create a new station' : 'Create a station to join'}</CardTitle>
        <p className="mt-2 text-sm text-ink/60">Takes about two minutes. You can edit everything later.</p>
        <Button
          className="mt-4"
          variant={stations.length > 0 ? 'secondary' : 'primary'}
          onClick={() => navigate(`/app/stations/new?inviteToken=${encodeURIComponent(token)}`)}
        >
          Create a new station
        </Button>
      </Card>
    </div>
  );
}

export function InvitePreviewPage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: preview, isLoading: previewLoading } = useInvitePreview(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <a href="/" className="inline-flex items-center">
            <img src={logoHorizontal} alt="ReadyCircle.net" className="h-14 w-auto" />
          </a>
          <h1 className="mt-4 text-2xl font-semibold text-ink">You&apos;re invited</h1>
        </div>

        {previewLoading || !token ? (
          <Card>
            <p className="text-sm text-ink/60">Loading invite…</p>
          </Card>
        ) : !preview?.valid ? (
          <Card>
            <p role="alert" className="text-sm text-red-700">
              {INVALID_REASON_MESSAGES[preview?.reason ?? 'not_found'] ?? 'This invite link is no longer valid.'}
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <p className="text-sm text-ink/80">
                You&apos;ve been invited to join <span className="font-semibold">{preview.circleName}</span> on
                ReadyCircle.
              </p>
              {preview.note ? <p className="mt-1 text-xs text-ink/50">&ldquo;{preview.note}&rdquo;</p> : null}
            </Card>

            {sessionLoading ? (
              <Card>
                <p className="text-sm text-ink/60">Loading…</p>
              </Card>
            ) : session?.authenticated ? (
              <JoinAsSignedInUser token={token} />
            ) : (
              <SignInToJoin token={token} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
