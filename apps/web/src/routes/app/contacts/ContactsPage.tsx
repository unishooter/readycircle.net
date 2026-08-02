import { useState } from 'react';
import { CONNECTIVITY_PATH_TYPE_LABELS } from '@readycircle/contracts';
import { Button, Card, CardTitle, Select } from '@readycircle/ui';
import { useCircles } from '../../../features/circles/api.js';
import { useDeleteContact, useMyContacts } from '../../../features/contacts/api.js';
import { LogContactForm } from '../../../features/contacts/LogContactForm.js';

function formatSignalRating(rating: number | null): string {
  if (rating === null) return '';
  return `${'\u2605'.repeat(rating)}${'\u2606'.repeat(5 - rating)}`;
}

export function ContactsPage() {
  const { data: contactsData, isLoading } = useMyContacts();
  const { data: circlesData } = useCircles();
  const deleteContact = useDeleteContact();
  const [loggingCircleId, setLoggingCircleId] = useState('');

  const contacts = contactsData?.items ?? [];
  const circles = circlesData?.items ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Contacts</h1>
        <p className="mt-1 text-sm text-ink/60">
          A log of verified QSOs -- contacts you&apos;ve confirmed with other stations in your Radio Circles.
        </p>
      </div>

      <Card>
        <CardTitle>Log a contact</CardTitle>
        {circles.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">
            Join a Circle with at least one other station to log a contact.
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            <label className="mb-1 block text-xs font-medium text-ink/60" htmlFor="log-contact-circle">
              Circle
            </label>
            <Select
              id="log-contact-circle"
              value={loggingCircleId}
              onChange={(event) => setLoggingCircleId(event.target.value)}
            >
              <option value="">Choose a Circle…</option>
              {circles.map((circle) => (
                <option key={circle.id} value={circle.id}>
                  {circle.name}
                </option>
              ))}
            </Select>
            {loggingCircleId ? (
              <LogContactForm circleId={loggingCircleId} onLogged={() => setLoggingCircleId('')} />
            ) : null}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Recent contacts</CardTitle>
        {isLoading ? (
          <p className="mt-3 text-sm text-ink/50">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No contacts logged yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {contact.stationName} &rarr; {contact.counterpartyStationName}
                  </p>
                  <p className="text-xs text-ink/60">
                    {new Date(contact.occurredAt).toLocaleString()} &middot; {contact.circleName} &middot;{' '}
                    {CONNECTIVITY_PATH_TYPE_LABELS[contact.mode]}
                    {contact.channel ? ` (${contact.channel})` : ''}
                  </p>
                  {contact.notes ? <p className="mt-1 text-xs text-ink/60">{contact.notes}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  {contact.signalRating !== null ? (
                    <span
                      aria-label={`Signal rating ${contact.signalRating} of 5`}
                      className="text-sm text-amber-600"
                    >
                      {formatSignalRating(contact.signalRating)}
                    </span>
                  ) : null}
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
                </div>
              </li>
            ))}
          </ul>
        )}
        {deleteContact.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {(deleteContact.error as Error).message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
