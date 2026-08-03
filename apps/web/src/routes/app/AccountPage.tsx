import { useEffect, useState } from 'react';
import type { CurrentUser } from '@readycircle/contracts';
import { Button, Card, CardTitle, CheckboxOption, Field, TextInput } from '@readycircle/ui';
import { useCurrentUser, useUpdateCurrentUser } from '../../features/session/api.js';
import { useZipLookup } from '../../features/geocoding/api.js';

interface AccountDraft {
  displayName: string;
  /** '' means "no override" -- the input displays the login email as a live default instead (see `toDraft`/render below). */
  contactEmail: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  emailVisibleToCircle: boolean;
  phoneVisibleToCircle: boolean;
  addressVisibleToCircle: boolean;
}

function toDraft(user: CurrentUser): AccountDraft {
  return {
    displayName: user.displayName,
    contactEmail: user.contactEmail ?? '',
    phone: user.phone ?? '',
    address: user.address ?? '',
    city: user.city ?? '',
    state: user.state ?? '',
    zip: user.zip ?? '',
    emailVisibleToCircle: user.emailVisibleToCircle,
    phoneVisibleToCircle: user.phoneVisibleToCircle,
    addressVisibleToCircle: user.addressVisibleToCircle,
  };
}

function hasAnyAddressValue(draft: AccountDraft): boolean {
  return Boolean(draft.address.trim() || draft.city.trim() || draft.state.trim() || draft.zip.trim());
}

const DEBOUNCE_MS = 400;

export function AccountPage() {
  const { data: user, isLoading } = useCurrentUser(true);
  const updateUser = useUpdateCurrentUser();
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [debouncedZip, setDebouncedZip] = useState('');

  useEffect(() => {
    if (user) setDraft(toDraft(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedZip(draft?.zip.trim() ?? ''), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [draft?.zip]);

  const { data: zipResult } = useZipLookup(debouncedZip);
  useEffect(() => {
    if (zipResult) setDraft((current) => (current ? { ...current, city: zipResult.city, state: zipResult.state } : current));
  }, [zipResult]);

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

  // The address group (street/city/state/zip) shares one visibility flag --
  // only turn it off once *every* part of the mailing address is empty.
  function patchAddressPart(fields: Partial<Pick<AccountDraft, 'address' | 'city' | 'state' | 'zip'>>) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...fields };
      return { ...next, addressVisibleToCircle: hasAnyAddressValue(next) ? next.addressVisibleToCircle : false };
    });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    await updateUser.mutateAsync({
      displayName: draft.displayName,
      // An empty contactEmail resets to `null`, which keeps tracking the
      // login email as a live default rather than "clearing" to nothing.
      contactEmail: draft.contactEmail.trim() || null,
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      state: draft.state.trim() ? draft.state.trim().toUpperCase() : null,
      zip: draft.zip.trim() || null,
      emailVisibleToCircle: draft.emailVisibleToCircle,
      phoneVisibleToCircle: draft.phoneVisibleToCircle,
      addressVisibleToCircle: draft.addressVisibleToCircle,
    });
  }

  const displayedEmail = draft.contactEmail || user.email || '';

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
            <Field label="Email" hint="Defaults to your sign-in email until you set a different one here.">
              {(id) => (
                <TextInput
                  id={id}
                  type="email"
                  value={displayedEmail}
                  onChange={(event) => patch({ contactEmail: event.target.value })}
                />
              )}
            </Field>
            <CheckboxOption
              label="Visible to my Circles"
              checked={draft.emailVisibleToCircle}
              disabled={!displayedEmail}
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
                  onChange={(event) => patchAddressPart({ address: event.target.value })}
                  placeholder="123 Main St"
                />
              )}
            </Field>
            <Field label="Zip" hint="Enter a zip code to auto-fill city and state.">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.zip}
                  onChange={(event) => patchAddressPart({ zip: event.target.value })}
                  placeholder="62704"
                  maxLength={10}
                />
              )}
            </Field>
            <Field label="City">
              {(id) => (
                <TextInput id={id} value={draft.city} onChange={(event) => patchAddressPart({ city: event.target.value })} />
              )}
            </Field>
            <Field label="State">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.state}
                  onChange={(event) => patchAddressPart({ state: event.target.value })}
                  placeholder="IL"
                  maxLength={2}
                />
              )}
            </Field>
            <CheckboxOption
              label="Visible to my Circles"
              checked={draft.addressVisibleToCircle}
              disabled={!hasAnyAddressValue(draft)}
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
