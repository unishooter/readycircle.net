import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CONNECTIVITY_PATH_TYPE_LABELS } from '@readycircle/contracts';
import { Button, Card, CardTitle } from '@readycircle/ui';
import { useCircleContacts, useDeleteContact } from './api.js';
import { LogContactForm } from './LogContactForm.js';

const RECENT_COUNT = 5;

export function CircleContactsCard({ circleId }: { circleId: string }) {
  const { data, isLoading } = useCircleContacts(circleId);
  const deleteContact = useDeleteContact();
  const [formOpen, setFormOpen] = useState(false);

  const contacts = data?.items ?? [];
  const recent = contacts.slice(0, RECENT_COUNT);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Contacts</CardTitle>
        {!formOpen ? (
          <Button size="sm" variant="secondary" onClick={() => setFormOpen(true)}>
            Log a contact
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink/60">
        A log of verified QSOs between this Circle&apos;s stations. Confirmed contacts strengthen the
        connectivity analysis in generated plans.
      </p>

      {formOpen ? (
        <LogContactForm circleId={circleId} onLogged={() => setFormOpen(false)} onCancel={() => setFormOpen(false)} />
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-ink/50">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">No contacts logged yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5">
          {recent.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  {contact.stationName} &harr; {contact.counterpartyStationName}
                </p>
                <p className="text-xs text-ink/50">
                  {new Date(contact.occurredAt).toLocaleDateString()} &middot;{' '}
                  {CONNECTIVITY_PATH_TYPE_LABELS[contact.mode]}
                </p>
              </div>
              {contact.viewerCanDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteContact.mutateAsync(contact.id)}
                  disabled={deleteContact.isPending}
                >
                  Delete
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {deleteContact.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {(deleteContact.error as Error).message}
        </p>
      ) : null}
      {contacts.length > recent.length ? (
        <Link to="/app/contacts" className="mt-3 inline-block text-xs font-medium text-navy-700">
          View all contacts &rarr;
        </Link>
      ) : null}
    </Card>
  );
}
