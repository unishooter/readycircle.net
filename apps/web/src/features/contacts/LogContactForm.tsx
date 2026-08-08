import { useMemo, useState, type FormEvent } from 'react';
import { CONNECTIVITY_PATH_TYPE_LABELS, type ContactLocation, type ContactMode, type LogContactInput } from '@readycircle/contracts';
import { Button, Field, Select, TextArea, TextInput } from '@readycircle/ui';
import { useCircleMembers } from '../circles/api.js';
import { ContactTimeLocationField } from '../location/ContactTimeLocationField.js';
import { useCircleRepeaters } from '../repeaters/api.js';
import { useSession } from '../session/api.js';
import { useStations } from '../stations/api.js';
import { useLogContact } from './api.js';

export interface LogContactFormProps {
  circleId: string;
  onLogged?: () => void;
  onCancel?: () => void;
}

const MODES: ContactMode[] = ['simplex', 'repeater', 'satellite', 'mesh'];

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's local time, no timezone suffix. */
function nowLocalInputValue(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offsetAdjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return offsetAdjusted.toISOString().slice(0, 16);
}

function coordsFromStation(station: {
  location?: { latitude: number | null; longitude: number | null };
} | null | undefined): ContactLocation | null {
  const lat = station?.location?.latitude;
  const lng = station?.location?.longitude;
  if (lat == null || lng == null) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Logging a contact is one-sided and self-declared: the acting user picks
 * one of their own stations in this Circle, plus any other active member
 * station, and the entry stands as the record (see ADR on the contact log).
 */
export function LogContactForm({ circleId, onLogged, onCancel }: LogContactFormProps) {
  const { data: session } = useSession();
  const { data: membersData } = useCircleMembers(circleId);
  const { data: stationsData } = useStations();
  const { data: repeatersData } = useCircleRepeaters(circleId);
  const logContact = useLogContact(circleId);

  const members = membersData?.items ?? [];
  const myStations = members.filter((member) => member.userId === session?.user?.id);
  const repeaters = repeatersData?.items ?? [];
  const ownedById = useMemo(
    () => new Map((stationsData?.items ?? []).map((station) => [station.id, station])),
    [stationsData?.items],
  );

  const [stationId, setStationId] = useState('');
  const [counterpartyStationId, setCounterpartyStationId] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalInputValue());
  const [mode, setMode] = useState<ContactMode>('simplex');
  const [repeaterId, setRepeaterId] = useState('');
  const [channel, setChannel] = useState('');
  const [signalRating, setSignalRating] = useState('');
  const [notes, setNotes] = useState('');
  const [stationLocation, setStationLocation] = useState<ContactLocation | null>(null);
  const [stationLocationOverridden, setStationLocationOverridden] = useState(false);
  const [counterpartyLocation, setCounterpartyLocation] = useState<ContactLocation | null>(null);
  const [counterpartyLocationOverridden, setCounterpartyLocationOverridden] = useState(false);

  const counterpartyOptions = members.filter((member) => member.stationId !== stationId);
  const canSubmit = Boolean(stationId) && Boolean(counterpartyStationId) && Boolean(occurredAt);

  const myDefault = coordsFromStation(ownedById.get(stationId));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const resolvedMine = stationLocationOverridden ? stationLocation : myDefault;
    const input: LogContactInput = {
      stationId,
      counterpartyStationId,
      occurredAt: new Date(occurredAt).toISOString(),
      mode,
      ...(mode === 'repeater' && repeaterId ? { repeaterId } : {}),
      ...(channel.trim() ? { channel: channel.trim() } : {}),
      ...(signalRating ? { signalRating: Number(signalRating) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(resolvedMine
        ? { stationLocation: resolvedMine, stationLocationOverridden }
        : stationLocationOverridden
          ? { stationLocation: null, stationLocationOverridden: false }
          : {}),
      ...(counterpartyLocationOverridden
        ? {
            counterpartyLocation,
            counterpartyLocationOverridden: counterpartyLocation != null,
          }
        : {}),
    };
    await logContact.mutateAsync(input);
    setStationId('');
    setCounterpartyStationId('');
    setOccurredAt(nowLocalInputValue());
    setMode('simplex');
    setRepeaterId('');
    setChannel('');
    setSignalRating('');
    setNotes('');
    setStationLocation(null);
    setStationLocationOverridden(false);
    setCounterpartyLocation(null);
    setCounterpartyLocationOverridden(false);
    onLogged?.();
  }

  if (myStations.length === 0) {
    return (
      <p className="mt-4 text-sm text-ink/60">
        You don&apos;t have a station in this Circle yet, so there&apos;s nothing to log a contact for.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-3 border-t border-black/5 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your station" required>
          {(id) => (
            <Select
              id={id}
              value={stationId}
              onChange={(event) => {
                setStationId(event.target.value);
                setCounterpartyStationId('');
                setStationLocation(null);
                setStationLocationOverridden(false);
              }}
            >
              <option value="">Choose…</option>
              {myStations.map((member) => (
                <option key={member.stationId} value={member.stationId}>
                  {member.stationName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Other station" required>
          {(id) => (
            <Select
              id={id}
              value={counterpartyStationId}
              onChange={(event) => {
                setCounterpartyStationId(event.target.value);
                setCounterpartyLocation(null);
                setCounterpartyLocationOverridden(false);
              }}
              disabled={!stationId}
            >
              <option value="">Choose…</option>
              {counterpartyOptions.map((member) => (
                <option key={member.stationId} value={member.stationId}>
                  {member.stationName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Date &amp; time" required>
          {(id) => (
            <TextInput
              id={id}
              type="datetime-local"
              value={occurredAt}
              max={nowLocalInputValue()}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          )}
        </Field>
        <Field label="Mode" required>
          {(id) => (
            <Select
              id={id}
              value={mode}
              onChange={(event) => {
                const next = event.target.value as ContactMode;
                setMode(next);
                if (next !== 'repeater') setRepeaterId('');
              }}
            >
              {MODES.map((value) => (
                <option key={value} value={value}>
                  {CONNECTIVITY_PATH_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {mode === 'repeater' ? (
          <Field label="Repeater" hint="Optional — which directory machine you used">
            {(id) => (
              <Select id={id} value={repeaterId} onChange={(event) => setRepeaterId(event.target.value)}>
                <option value="">Not specified</option>
                {repeaters.map((repeater) => (
                  <option key={repeater.id} value={repeater.id}>
                    {repeater.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Channel" hint="Optional, e.g. a GMRS channel or dial setting">
          {(id) => (
            <TextInput
              id={id}
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              placeholder="e.g. GMRS ch 3"
              maxLength={200}
            />
          )}
        </Field>
        <Field label="Signal quality" hint="Optional">
          {(id) => (
            <Select id={id} value={signalRating} onChange={(event) => setSignalRating(event.target.value)}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} / 5
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {stationId ? (
        <ContactTimeLocationField
          label="Where you were (optional)"
          hint="Defaults to your station's saved location. Adjust if you were mobile."
          defaultLocation={myDefault}
          defaultKnown={myDefault != null}
          value={stationLocation}
          overridden={stationLocationOverridden}
          onChange={({ location, overridden }) => {
            setStationLocation(location);
            setStationLocationOverridden(overridden);
          }}
        />
      ) : null}

      {counterpartyStationId ? (
        <ContactTimeLocationField
          label="Where they were (optional)"
          hint="Self-declared — where you believe the other station was. Defaults to their saved location on the server."
          defaultLocation={null}
          defaultKnown={false}
          value={counterpartyLocation}
          overridden={counterpartyLocationOverridden}
          onChange={({ location, overridden }) => {
            setCounterpartyLocation(location);
            setCounterpartyLocationOverridden(overridden);
          }}
        />
      ) : null}

      <Field label="Notes" hint="Optional">
        {(id) => (
          <TextArea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
        )}
      </Field>
      {logContact.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(logContact.error as Error).message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit || logContact.isPending}>
          {logContact.isPending ? 'Logging…' : 'Log contact'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
