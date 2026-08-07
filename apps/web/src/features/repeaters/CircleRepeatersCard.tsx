import { useState, type FormEvent } from 'react';
import {
  REPEATER_ACCESS_LABELS,
  REPEATER_SERVICE_LABELS,
  REPEATER_STATUS_LABELS,
  type CreateRepeaterInput,
  type RepeaterImportCandidate,
  type RepeaterResponse,
  type RepeaterService,
  type RepeaterStatus,
  type UpdateRepeaterInput,
} from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle, Field, Select, TextArea, TextInput } from '@readycircle/ui';
import {
  useCircleRepeaterChecks,
  useCircleRepeaters,
  useCreateRepeater,
  useDeleteRepeater,
  useDeleteRepeaterCheck,
  useImportRepeaters,
  useRepeaterImportSearch,
  useUpdateRepeater,
} from './api.js';
import { LogRepeaterCheckForm } from './LogRepeaterCheckForm.js';
import { RepeaterLocationFields, type RepeaterLocationValue } from './RepeaterLocationFields.js';

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
    repeater.latitude == null || repeater.longitude == null ? 'No location' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Circle repeater directory: any member can add entries manually or import
 * from RepeaterBook; coordinators (and the member who added an entry) can
 * edit or remove. Members log access checks from here; stations also declare
 * RX/TX on their own edit page.
 */
export function CircleRepeatersCard({ circleId, isCoordinator }: CircleRepeatersCardProps) {
  const { data, isLoading } = useCircleRepeaters(circleId);
  const { data: checksData } = useCircleRepeaterChecks(circleId);
  const deleteCheck = useDeleteRepeaterCheck(circleId);
  const [mode, setMode] = useState<'list' | 'add' | 'import'>('list');

  const repeaters = data?.items ?? [];
  const recentChecks = (checksData?.items ?? []).slice(0, 5);

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

      {mode === 'list' && recentChecks.length > 0 ? (
        <div className="mt-4 border-t border-black/5 pt-3">
          <p className="text-sm font-medium text-ink">Recent checks</p>
          <ul className="mt-2 divide-y divide-black/5">
            {recentChecks.map((check) => (
              <li key={check.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {check.stationName} · {check.repeaterName}
                  </p>
                  <p className="text-xs text-ink/50">
                    {new Date(check.occurredAt).toLocaleDateString()} · {REPEATER_ACCESS_LABELS[check.access]}
                    {check.counterpartyNote ? ` · ${check.counterpartyNote}` : ''}
                  </p>
                </div>
                {check.viewerCanDelete ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteCheck.mutateAsync(check.id)}
                    disabled={deleteCheck.isPending}
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
  const deleteRepeater = useDeleteRepeater(circleId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  if (repeaters.length === 0) return null;

  return (
    <ul className="mt-3 divide-y divide-black/5">
      {repeaters.map((repeater) => (
        <li key={repeater.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-ink">{repeater.name}</p>
                <Badge tone={STATUS_TONES[repeater.status]}>{REPEATER_STATUS_LABELS[repeater.status]}</Badge>
                {repeater.source === 'repeaterbook' ? <Badge tone="neutral">RepeaterBook</Badge> : null}
                {repeater.latitude == null || repeater.longitude == null ? (
                  <Badge tone="amber">No location</Badge>
                ) : null}
              </div>
              <p className="text-xs text-ink/60">{repeaterMeta(repeater)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCheckingId((current) => (current === repeater.id ? null : repeater.id));
                  setEditingId(null);
                }}
              >
                Log check
              </Button>
              {repeater.viewerCanManage ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingId((current) => (current === repeater.id ? null : repeater.id));
                      setCheckingId(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteRepeater.mutateAsync(repeater.id)}
                    disabled={deleteRepeater.isPending}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          {editingId === repeater.id ? (
            <EditRepeaterForm
              circleId={circleId}
              repeater={repeater}
              isCoordinator={isCoordinator}
              onClose={() => setEditingId(null)}
            />
          ) : null}
          {checkingId === repeater.id ? (
            <LogRepeaterCheckForm
              circleId={circleId}
              repeater={repeater}
              onLogged={() => setCheckingId(null)}
              onCancel={() => setCheckingId(null)}
            />
          ) : null}
        </li>
      ))}
      {deleteRepeater.isError ? (
        <li role="alert" className="py-2 text-xs text-red-700">
          {(deleteRepeater.error as Error).message}
        </li>
      ) : null}
    </ul>
  );
}

interface RepeaterDraft {
  service: RepeaterService;
  name: string;
  callsign: string;
  outputFrequencyMhz: string;
  offsetOrInput: string;
  tone: string;
  status: RepeaterStatus;
  notes: string;
  location: RepeaterLocationValue;
}

const EMPTY_DRAFT: RepeaterDraft = {
  service: 'gmrs',
  name: '',
  callsign: '',
  outputFrequencyMhz: '',
  offsetOrInput: '',
  tone: '',
  status: 'active',
  notes: '',
  location: { areaLabel: '', latitude: null, longitude: null },
};

function draftFromRepeater(repeater: RepeaterResponse): RepeaterDraft {
  return {
    service: repeater.service,
    name: repeater.name,
    callsign: repeater.callsign ?? '',
    outputFrequencyMhz: String(repeater.outputFrequencyMhz),
    offsetOrInput: repeater.offsetOrInput ?? '',
    tone: repeater.tone ?? '',
    status: repeater.status,
    notes: repeater.notes ?? '',
    location: {
      areaLabel: repeater.areaLabel ?? '',
      latitude: repeater.latitude,
      longitude: repeater.longitude,
    },
  };
}

function RepeaterFields({
  draft,
  setDraft,
  showStatus,
}: {
  draft: RepeaterDraft;
  setDraft: (updater: (current: RepeaterDraft) => RepeaterDraft) => void;
  showStatus: boolean;
}) {
  return (
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
      {showStatus ? (
        <Field label="Status">
          {(id) => (
            <Select
              id={id}
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as RepeaterStatus }))}
            >
              <option value="active">Active</option>
              <option value="offline">Off-air</option>
              <option value="unverified">Unverified</option>
            </Select>
          )}
        </Field>
      ) : null}
      <Field label="Notes">
        {(id) => (
          <TextArea
            id={id}
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            maxLength={1000}
          />
        )}
      </Field>
      <RepeaterLocationFields
        value={draft.location}
        onChange={(location) => setDraft((d) => ({ ...d, location }))}
      />
    </div>
  );
}

function AddRepeaterForm({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const createRepeater = useCreateRepeater(circleId);
  const [draft, setDraft] = useState<RepeaterDraft>(EMPTY_DRAFT);

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
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      ...(draft.location.areaLabel.trim() ? { areaLabel: draft.location.areaLabel.trim() } : {}),
      ...(draft.location.latitude != null && draft.location.longitude != null
        ? { latitude: draft.location.latitude, longitude: draft.location.longitude }
        : {}),
    };
    await createRepeater.mutateAsync(input);
    setDraft(EMPTY_DRAFT);
    onClose();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3 border-t border-black/5 pt-4">
      <p className="text-sm font-medium text-ink">Add a repeater</p>
      <RepeaterFields draft={draft} setDraft={setDraft} showStatus={false} />
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

function EditRepeaterForm({
  circleId,
  repeater,
  isCoordinator,
  onClose,
}: {
  circleId: string;
  repeater: RepeaterResponse;
  isCoordinator: boolean;
  onClose: () => void;
}) {
  const updateRepeater = useUpdateRepeater(circleId);
  const [draft, setDraft] = useState<RepeaterDraft>(() => draftFromRepeater(repeater));

  const frequency = Number(draft.outputFrequencyMhz);
  const canSubmit = draft.name.trim().length > 0 && Number.isFinite(frequency) && frequency > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const input: UpdateRepeaterInput = {
      service: draft.service,
      name: draft.name.trim(),
      outputFrequencyMhz: frequency,
      callsign: draft.callsign.trim() || null,
      offsetOrInput: draft.offsetOrInput.trim() || null,
      tone: draft.tone.trim() || null,
      notes: draft.notes.trim() || null,
      areaLabel: draft.location.areaLabel.trim() || null,
      latitude: draft.location.latitude,
      longitude: draft.location.longitude,
      ...(isCoordinator ? { status: draft.status } : {}),
    };
    await updateRepeater.mutateAsync({ repeaterId: repeater.id, input });
    onClose();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-3 rounded-lg border border-black/5 p-3">
      <p className="text-sm font-medium text-ink">Edit repeater</p>
      <RepeaterFields draft={draft} setDraft={setDraft} showStatus={isCoordinator} />
      {updateRepeater.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(updateRepeater.error as Error).message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit || updateRepeater.isPending}>
          {updateRepeater.isPending ? 'Saving…' : 'Save'}
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
