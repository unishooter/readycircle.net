import { useState } from 'react';
import { Button, Card, CardTitle, Field, TextInput } from '@readycircle/ui';
import { useCurrentUser, useUpdateCurrentUser } from '../../features/session/api.js';

export function AccountPage() {
  const { data: user, isLoading } = useCurrentUser(true);
  const updateUser = useUpdateCurrentUser();
  const [displayName, setDisplayName] = useState('');
  const [edited, setEdited] = useState(false);

  if (isLoading || !user) {
    return <p className="text-sm text-ink/50">Loading account…</p>;
  }

  const currentName = edited ? displayName : user.displayName;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    await updateUser.mutateAsync({ displayName: currentName });
    setEdited(false);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink/60">Manage your ReadyCircle profile.</p>
      </div>

      <Card>
        <CardTitle>Profile</CardTitle>
        <form className="mt-4 space-y-4" onSubmit={(event) => void handleSave(event)}>
          <Field label="Display name" required>
            {(id) => (
              <TextInput
                id={id}
                value={currentName}
                onChange={(event) => {
                  setEdited(true);
                  setDisplayName(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Email" hint="Contact your administrator to change this.">
            {(id) => <TextInput id={id} value={user.email ?? ''} disabled />}
          </Field>
          <Field label="Sign-in method">
            {(id) => <TextInput id={id} value={user.authProvider} disabled />}
          </Field>
          <Button type="submit" disabled={updateUser.isPending || !edited}>
            {updateUser.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
