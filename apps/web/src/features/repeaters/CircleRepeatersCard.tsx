import { useState, type FormEvent } from 'react';
import {
  REPEATER_SERVICE_LABELS,
  REPEATER_STATUS_LABELS,
  type CreateRepeaterInput,
  type RepeaterImportCandidate,
  type RepeaterResponse,
  type RepeaterService,
  type RepeaterStatus,
} from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle, Field, Select, TextInput } from '@readycircle/ui';
import {
  useCircleRepeaters,
  useCreateRepeater,
  useDeleteRepeater,
  useImportRepeaters,
  useRepeaterImportSearch,
  useUpdateRepeater,
} from './api.js';

export interface CircleRepeatersCardProps {
  circleId: string;
  isCoordinator: boolean;
}

const STATUS_TONES: Record<RepeaterStatus, 'primary' | 'neutral' | 'amber'> = {
  active: 'primary',
  offline: 'amber',
  unverified: 'neutral',
};

function repeaterMeta(repeater: RepeaterResponse): string {
  return [
    REPEATER_SERVICE_LABELS[repeater.service],
    `${repeater.outputFrequencyMhz.toFixed(4)} MHz`,
    repeater.offsetOrInput ? `offset ${repeater.offsetOrInput}` : null,
    repeater.tone ? `tone ${repeater.tone}` : null,
    repeater.callsign,
    repeater.areaLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Circle repeater directory: any member can add entries manually or import
 * from RepeaterBook; coordinators (and the member who added an entry) can
 * curate status or remove entries. Stations then declare RX/TX access to
 * these repeaters from their own edit page.
 */
export function CircleRepeatersCard({ circleId, isCoordinator }: CircleRepeatersCardProps) {
  const { data, isLoading } = useCircleRepeaters(circleId);
  const [mode, setMode] = useState<'list' | 'add' | 'import'>('list');

  const repeaters = data?.items ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Repeaters</CardTitle>
        {mode === 'list' ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMode('import')}>
              Find repeaters near this Circle
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode('add')}>
              Add manually
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-ink/50">Loading…</p>
      ) : repeaters.length === 0 && mode === 'list' ? (
        <p className="mt-3 text-sm text-ink/60">
          No repeaters listed yet. Add the ham and GMRS repeaters members can hear -- they feed the
          coverage analysis in generated plans.
        </p>
      ) : (
        <RepeaterList circleId={circleId} repeaters={repeaters} isCoordinator={isCoordinator} />
      )}

      {mode === 'add' ? <AddRepeaterForm circleId={circleId} onClose={() => setMode('list')} /> : null}
      {mode === 'import' ? <ImportRepeatersPanel circleId={circleId} onClose={() => setMode('list')} /> : null}
    </Card>
  );
}

function RepeaterList({
  circleId,
  repeaters,
  isCoordinator,
}: {
  circleId: string;
  repeaters: RepeaterResponse[];
  isCoordinator: boolean;
}) {
  const updateRepeater = useUpdateRepeater(circleId);
  const deleteRepeater = useDeleteRepeater(circleId);

  if (repeaters.length === 0) return null;

  return (
    <>
      <ul className="mt-3 divide-y divide-black/5">
        {repeaters.map((repeater) => (
          <li key={repeater.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-ink">{repeater.name}</p>
                <Badge tone={STATUS_TONES[repeater.status]}>{REPEATER_STATUS_LABELS[repeater.status]}</Badge>
                {repeater.source === 'repeaterbook' ? <Badge tone="neutral">RepeaterBook</Badge> : null}
              </div>
              <p className="text-xs text-ink/60">{repeaterMeta(repeater)}</p>
            </div>
            {repeater.viewerCanManage ? (
              <div className="flex items-center gap-2">
                {isCoordinator ? (
                  <select
                    aria-label={`Status of ${repeater.name}`}
                    className="rounded-md border border-black/10 px-2 py-1 text-xs"
                    value={repeater.status}
                    onChange={(event) =>
                      void updateRepeater.mutateAsync({
                        repeaterId: repeater.id,
                        input: { status: event.target.value as RepeaterStatus },
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="offline">Off-air</option>
                    <option value="unverified">Unverified</option>
                  </select>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteRepeater.mutateAsync(repeater.id)}
                  disabled={deleteRepeater.isPending}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {updateRepeater.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {(updateRepeater.error as Error).message}
        </p>
      ) : null}
      {deleteRepeater.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {(deleteRepeater.error as Error).message}
        </p>
      ) : null}
    </>
  );
}

interface AddDraft {
  service: RepeaterService;
  name: string;
  callsign: string;
  outputFrequencyMhz: string;
  offsetOrInput: string;
  tone: string;
  areaLabel: string;
}

const EMPTY_DRAFT: AddDraft = {
  service: 'gmrs',
  name: '',
  callsign: '',
  outputFrequencyMhz: '',
  offsetOrInput: '',
  tone: '',
  areaLabel: '',
};

function AddRepeaterForm({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const createRepeater = useCreateRepeater(circleId);
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT);

  const frequency = Number(draft.outputFrequencyMhz);
  const canSubmit = draft.name.trim().length > 0 && Number.isFinite(frequency) && frequency > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const input: CreateRepeaterInput = {
      service: draft.service,
      name: draft.name.trim(),
      outputFrequencyMhz: frequency,
      status: 'active',
      ...(draft.callsign.trim() ? { callsign: draft.callsign.trim() } : {}),
      ...(draft.offsetOrInput.trim() ? { offsetOrInput: draft.offsetOrInput.trim() } : {}),
      ...(draft.tone.trim() ? { tone: draft.tone.trim() } : {}),
      ...(draft.areaLabel.trim() ? { areaLabel: draft.areaLabel.trim() } : {}),
    };
    await createRepeater.mutateAsync(input);
    setDraft(EMPTY_DRAFT);
    onClose();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3 border-t border-black/5 pt-4">
      <p className="text-sm font-medium text-ink">Add a repeater</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service" required>
          {(id) => (
            <Select
              id={id}
              value={draft.service}
              onChange={(e) => setDraft((d) => ({ ...d, service: e.target.value as RepeaterService }))}
            >
              <option value="gmrs">GMRS</option>
              <option value="ham">Amateur (ham)</option>
            </Select>
          )}
        </Field>
        <Field label="Name" required>
          {(id) => (
            <TextInput
              id={id}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Marion County 725"
            />
          )}
        </Field>
        <Field label="Output frequency (MHz)" required>
          {(id) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={draft.outputFrequencyMhz}
              onChange={(e) => setDraft((d) => ({ ...d, outputFrequencyMhz: e.target.value }))}
              placeholder="e.g. 462.725"
            />
          )}
        </Field>
        <Field label="Offset / input">
          {(id) => (
            <TextInput
              id={id}
              value={draft.offsetOrInput}
              onChange={(e) => setDraft((d) => ({ ...d, offsetOrInput: e.target.value }))}
              placeholder="e.g. +5 MHz"
            />
          )}
        </Field>
        <Field label="Tone">
          {(id) => (
            <TextInput
              id={id}
              value={draft.tone}
              onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))}
              placeholder="e.g. 141.3"
            />
          )}
        </Field>
        <Field label="Callsign">
          {(id) => (
            <TextInput
              id={id}
              value={draft.callsign}
              onChange={(e) => setDraft((d) => ({ ...d, callsign: e.target.value }))}
              placeholder="e.g. WRXX123"
            />
          )}
        </Field>
        <Field label="Area" hint="Where the repeater is, roughly">
          {(id) => (
            <TextInput
              id={id}
              value={draft.areaLabel}
              onChange={(e) => setDraft((d) => ({ ...d, areaLabel: e.target.value }))}
              placeholder="e.g. north side of town"
            />
          )}
        </Field>
      </div>
      {createRepeater.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(createRepeater.error as Error).message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit || createRepeater.isPending}>
          {createRepeater.isPending ? 'Adding…' : 'Add repeater'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ImportRepeatersPanel({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const [service, setService] = useState<RepeaterService>('gmrs');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const search = useRepeaterImportSearch(circleId, service, true);
  const importRepeaters = useImportRepeaters(circleId);

  function toggle(externalId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  }

  async function handleImport() {
    if (!search.data?.state || selected.size === 0) return;
    await importRepeaters.mutateAsync({
      externalIds: [...selected],
      service,
      state: search.data.state,
    });
    setSelected(new Set());
    onClose();
  }

  const candidates: RepeaterImportCandidate[] = search.data?.candidates ?? [];

  return (
    <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Find repeaters near this Circle</p>
        <div className="flex gap-1" role="radiogroup" aria-label="Repeater service">
          {(['gmrs', 'ham'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={service === value}
              onClick={() => {
                setService(value);
                setSelected(new Set());
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                service === value ? 'bg-navy-700 text-white' : 'bg-black/5 text-ink/70 hover:bg-black/10'
              }`}
            >
              {REPEATER_SERVICE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {search.isLoading ? <p className="text-sm text-ink/50">Searching RepeaterBook…</p> : null}
      {search.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(search.error as Error).message}
        </p>
      ) : null}

      {search.data && !search.data.configured ? (
        <p className="text-sm text-ink/60">
          RepeaterBook import isn&apos;t configured on this server. You can still add repeaters manually.
        </p>
      ) : null}

      {search.data?.configured && candidates.length === 0 && !search.isLoading ? (
        <p className="text-sm text-ink/60">
          No {REPEATER_SERVICE_LABELS[service]} repeaters found near this Circle
          {search.data.state ? ` (searched ${search.data.state})` : ''}.
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {candidates.map((candidate) => (
            <li key={candidate.externalId}>
              <label
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                  candidate.alreadyImported
                    ? 'border-black/5 opacity-60'
                    : selected.has(candidate.externalId)
                      ? 'border-navy-300 bg-navy-50'
                      : 'border-black/5 hover:border-navy-300'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={candidate.alreadyImported || selected.has(candidate.externalId)}
                    disabled={candidate.alreadyImported}
                    onChange={() => toggle(candidate.externalId)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{candidate.name}</p>
                    <p className="text-xs text-ink/60">
                      {[
                        `${candidate.outputFrequencyMhz.toFixed(4)} MHz`,
                        candidate.tone ? `tone ${candidate.tone}` : null,
                        candidate.callsign,
                        candidate.areaLabel,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-ink/50">
                  {candidate.alreadyImported
                    ? 'In directory'
                    : candidate.distanceKm !== null
                      ? `~${Math.round(candidate.distanceKm)} km`
                      : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      {importRepeaters.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(importRepeaters.error as Error).message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void handleImport()}
          disabled={selected.size === 0 || importRepeaters.isPending}
        >
          {importRepeaters.isPending
            ? 'Importing…'
            : `Import selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
