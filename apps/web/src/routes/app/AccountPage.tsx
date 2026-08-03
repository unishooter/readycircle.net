import { useEffect, useState } from 'react';
import type { CurrentUser } from '@readycircle/contracts';
import { Button, Card, CardTitle, CheckboxOption, Field, TextInput } from '@readycircle/ui';
import { useCurrentUser, useUpdateCurrentUser } from '../../features/session/api.js';

interface AccountDraft {
  displayName: string;
  phone: string;
  address: string;
  emailVisibleToCircle: boolean;
  phoneVisibleToCircle: boolean;
  addressVisibleToCircle: boolean;
}

function toDraft(user: CurrentUser): AccountDraft {
  return {
    displayName: user.displayName,
    phone: user.phone ?? '',
    address: user.address ?? '',
    emailVisibleToCircle: user.emailVisibleToCircle,
    phoneVisibleToCircle: user.phoneVisibleToCircle,
    addressVisibleToCircle: user.addressVisibleToCircle,
  };
}

export function AccountPage() {
  const { data: user, isLoading } = useCurrentUser(true);
  const updateUser = useUpdateCurrentUser();
  const [draft, setDraft] = useState<AccountDraft | null>(null);

  useEffect(() => {
    if (user) setDraft(toDraft(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (isLoading || !user || !draft) {
    return <p className="text-sm text-ink/50">Loading account…</p>;
  }

  function patch(fields: Partial<AccountDraft>) {
    setDraft((current) => (current ? { ...current, ...fields } : current));
  }

  // Clearing a field's value also turns off its visibility toggle -- sharing
  // is meaningless (and confusing to leave lit) once there's nothing to share.
  function patchPhone(value: string) {
    setDraft((current) =>
      current ? { ...current, phone: value, phoneVisibleToCircle: value.trim() ? current.phoneVisibleToCircle : false } : current,
    );
  }

  function patchAddress(value: string) {
    setDraft((current) =>
      current
        ? { ...current, address: value, addressVisibleToCircle: value.trim() ? current.addressVisibleToCircle : false }
        : current,
    );
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    await updateUser.mutateAsync({
      displayName: draft.displayName,
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      emailVisibleToCircle: draft.emailVisibleToCircle,
      phoneVisibleToCircle: draft.phoneVisibleToCircle,
      addressVisibleToCircle: draft.addressVisibleToCircle,
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink/60">Manage your ReadyCircle profile.</p>
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-6">
        <Card>
          <CardTitle>Profile</CardTitle>
          <div className="mt-4 space-y-4">
            <Field label="Display name" required>
              {(id) => (
                <TextInput id={id} value={draft.displayName} onChange={(event) => patch({ displayName: event.target.value })} />
              )}
            </Field>
            <Field label="Sign-in method">{(id) => <TextInput id={id} value={user.authProvider} disabled />}</Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Contact info &amp; sharing</CardTitle>
          <p className="mt-1 text-xs text-ink/50">
            Optionally share how fellow Circle members can reach you outside the app. Nothing below is shared
            with anyone until you turn its toggle on.
          </p>

          <div className="mt-4 space-y-3">
            <Field label="Email" hint="Contact your administrator to change this.">
              {(id) => <TextInput id={id} value={user.email ?? ''} disabled />}
            </Field>
            <CheckboxOption
              label="Visible to my Circles"
              checked={draft.emailVisibleToCircle}
              disabled={!user.email}
              onChange={(event) => patch({ emailVisibleToCircle: event.target.checked })}
            />
          </div>

          <div className="mt-6 space-y-3">
            <Field label="Phone">
              {(id) => (
                <TextInput id={id} value={draft.phone} onChange={(event) => patchPhone(event.target.value)} placeholder="(555) 555-0100" />
              )}
            </Field>
            <CheckboxOption
              label="Visible to my Circles"
              checked={draft.phoneVisibleToCircle}
              disabled={draft.phone.trim().length === 0}
              onChange={(event) => patch({ phoneVisibleToCircle: event.target.checked })}
            />
          </div>

          <div className="mt-6 space-y-3">
            <Field label="Address">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.address}
                  onChange={(event) => patchAddress(event.target.value)}
                  placeholder="123 Main St, Anytown"
                />
              )}
            </Field>
            <CheckboxOption
              label="Visible to my Circles"
              checked={draft.addressVisibleToCircle}
              disabled={draft.address.trim().length === 0}
              onChange={(event) => patch({ addressVisibleToCircle: event.target.checked })}
            />
          </div>
        </Card>

        {updateUser.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {(updateUser.error as Error).message}
          </p>
        ) : null}

        <Button type="submit" disabled={updateUser.isPending}>
          {updateUser.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </div>
  );
}
