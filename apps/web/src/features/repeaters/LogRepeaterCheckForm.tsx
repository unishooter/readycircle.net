import { useState, type FormEvent } from 'react';
import {
  REPEATER_ACCESS_LABELS,
  type LogRepeaterCheckInput,
  type RepeaterAccess,
  type RepeaterResponse,
} from '@readycircle/contracts';
import { Button, Field, Select, TextArea, TextInput } from '@readycircle/ui';
import { useCircleMembers } from '../circles/api.js';
import { useSession } from '../session/api.js';
import { useLogRepeaterCheck } from './api.js';

export interface LogRepeaterCheckFormProps {
  circleId: string;
  repeater: RepeaterResponse;
  onLogged?: () => void;
  onCancel?: () => void;
}

function nowLocalInputValue(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offsetAdjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return offsetAdjusted.toISOString().slice(0, 16);
}

export function LogRepeaterCheckForm({
  circleId,
  repeater,
  onLogged,
  onCancel,
}: LogRepeaterCheckFormProps) {
  const { data: session } = useSession();
  const { data: membersData } = useCircleMembers(circleId);
  const logCheck = useLogRepeaterCheck(circleId);

  const myStations = (membersData?.items ?? []).filter((member) => member.userId === session?.user?.id);

  const [stationId, setStationId] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalInputValue());
  const [access, setAccess] = useState<RepeaterAccess>('rx_tx');
  const [counterpartyNote, setCounterpartyNote] = useState('');
  const [signalRating, setSignalRating] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = Boolean(stationId) && Boolean(occurredAt);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const input: LogRepeaterCheckInput = {
      stationId,
      repeaterId: repeater.id,
      occurredAt: new Date(occurredAt).toISOString(),
      access,
      ...(counterpartyNote.trim() ? { counterpartyNote: counterpartyNote.trim() } : {}),
      ...(signalRating ? { signalRating: Number(signalRating) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    await logCheck.mutateAsync(input);
    onLogged?.();
  }

  if (myStations.length === 0) {
    return (
      <p className="mt-3 text-sm text-ink/60">
        You need a station in this Circle to log a repeater check.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 space-y-3 rounded-lg border border-black/5 p-3">
      <p className="text-sm font-medium text-ink">Log check · {repeater.name}</p>
      <p className="text-xs text-ink/50">
        Records that your station heard or keyed this machine. Also updates your station&apos;s
        declared repeater access for plan coverage.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your station" required>
          {(id) => (
            <Select id={id} value={stationId} onChange={(event) => setStationId(event.target.value)}>
              <option value="">Choose…</option>
              {myStations.map((member) => (
                <option key={member.stationId} value={member.stationId}>
                  {member.stationName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Access" required>
          {(id) => (
            <Select
              id={id}
              value={access}
              onChange={(event) => setAccess(event.target.value as RepeaterAccess)}
            >
              <option value="rx">{REPEATER_ACCESS_LABELS.rx}</option>
              <option value="rx_tx">{REPEATER_ACCESS_LABELS.rx_tx}</option>
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
        <Field label="Who you heard" hint="Optional — callsign or leave blank">
          {(id) => (
            <TextInput
              id={id}
              value={counterpartyNote}
              onChange={(event) => setCounterpartyNote(event.target.value)}
              placeholder="e.g. W9XYZ or unspecified"
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
      <Field label="Notes" hint="Optional">
        {(id) => (
          <TextArea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
        )}
      </Field>
      {logCheck.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(logCheck.error as Error).message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit || logCheck.isPending}>
          {logCheck.isPending ? 'Logging…' : 'Log check'}
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
