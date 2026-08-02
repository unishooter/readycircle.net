import { useState } from 'react';
import type { CircleInviteStatus } from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle, TextInput } from '@readycircle/ui';
import { useCircleInvites, useCreateCircleInvite, useRevokeCircleInvite } from './api.js';

const STATUS_TONE: Record<CircleInviteStatus, 'primary' | 'neutral' | 'amber'> = {
  pending: 'primary',
  accepted: 'neutral',
  revoked: 'amber',
  expired: 'amber',
};

interface InviteCardProps {
  circleId: string;
}

export function InviteCard({ circleId }: InviteCardProps) {
  const { data, isLoading } = useCircleInvites(circleId);
  const createInvite = useCreateCircleInvite(circleId);
  const revokeInvite = useRevokeCircleInvite(circleId);
  const [formOpen, setFormOpen] = useState(false);
  const [note, setNote] = useState('');
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invites = data?.items ?? [];

  async function handleCreate() {
    const created = await createInvite.mutateAsync({ note: note.trim() || undefined });
    setCreatedLink(created.inviteUrl);
    setNote('');
    setFormOpen(false);
    setCopied(false);
  }

  async function handleCopy() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
    } catch {
      // Clipboard access can fail (e.g. insecure context); the link text is still shown for manual copy.
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Invite someone</CardTitle>
        {!formOpen ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            New invite
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink/60">
        Any member can invite someone to join this Circle. Links are single-use and expire after 14 days.
      </p>

      {formOpen ? (
        <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
          <label className="mb-1 block text-xs font-medium text-ink/60" htmlFor="invite-note">
            Note (optional, just for your own tracking)
          </label>
          <TextInput
            id="invite-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. for Jane"
            maxLength={200}
          />
          {createInvite.isError ? (
            <p role="alert" className="text-xs text-red-700">
              {(createInvite.error as Error).message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleCreate()} disabled={createInvite.isPending}>
              {createInvite.isPending ? 'Creating…' : 'Create invite link'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {createdLink ? (
        <div className="mt-4 rounded-lg border border-navy-200 bg-navy-50 p-3">
          <p className="text-xs font-medium text-navy-800">
            Copy this link and send it via email or text — it expires in 14 days and can only be used once.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={createdLink}
              onFocus={(event) => event.target.select()}
              className="flex-1 truncate rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-ink"
            />
            <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-ink/50">Loading…</p>
      ) : invites.length > 0 ? (
        <ul className="mt-4 divide-y divide-black/5">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm text-ink">{invite.note || 'Invite'}</p>
                <p className="text-xs text-ink/50">
                  By {invite.invitedByDisplayName} &middot; {new Date(invite.createdAt).toLocaleDateString()}
                  {invite.status === 'accepted' && invite.acceptedByDisplayName
                    ? ` \u00b7 Joined as ${invite.acceptedByDisplayName}`
                    : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[invite.status]}>{invite.status}</Badge>
                {invite.status === 'pending' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void revokeInvite.mutateAsync(invite.id)}
                    disabled={revokeInvite.isPending}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink/50">No invites yet.</p>
      )}
      {revokeInvite.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {(revokeInvite.error as Error).message}
        </p>
      ) : null}
    </Card>
  );
}
