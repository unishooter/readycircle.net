import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { NET_FREQUENCY_LABELS, type NetFrequency } from '@readycircle/contracts';
import { Button, Card, CardTitle, Field, Select, TextArea, TextInput } from '@readycircle/ui';
import { useCreateNet, useNet, useUpdateNet } from '../../../features/nets/api.js';
import { usePlanVersion } from '../../../features/plans/api.js';
import { useCircle } from '../../../features/circles/api.js';
import { prefillFromPlanVersion } from '../../../features/nets/plan-prefill.js';

/**
 * Valid IANA timezone names from the runtime itself, so the select can
 * never produce a value the server-side Intl validation would reject.
 */
const TIME_ZONES: string[] = Intl.supportedValuesOf('timeZone');

interface NetDraft {
  name: string;
  description: string;
  channel: string;
  frequency: NetFrequency;
  firstOccursOn: string;
  timeLocal: string;
  timezone: string;
  durationMinutes: number;
  /** One step per line in the editor. */
  procedureText: string;
}

function emptyDraft(): NetDraft {
  return {
    name: '',
    description: '',
    channel: '',
    frequency: 'weekly',
    firstOccursOn: '',
    timeLocal: '19:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    durationMinutes: 30,
    procedureText: '',
  };
}

function draftToInput(draft: NetDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    channel: draft.channel.trim(),
    schedule: {
      frequency: draft.frequency,
      firstOccursOn: draft.firstOccursOn,
      timeLocal: draft.timeLocal,
      timezone: draft.timezone.trim(),
      durationMinutes: draft.durationMinutes,
    },
    procedure: draft.procedureText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

/** Create form at /app/circles/:circleId/nets/new (optionally prefilled from a plan). */
export function NetCreatePage() {
  const { circleId } = useParams<{ circleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: circle } = useCircle(circleId);
  const createNet = useCreateNet(circleId ?? '');

  // Optional plan prefill: ?planId=...&versionId=...
  const planId = searchParams.get('planId') ?? undefined;
  const versionId = searchParams.get('versionId') ?? undefined;
  const { data: planVersion, isLoading: planLoading } = usePlanVersion(planId, versionId);

  const [draft, setDraft] = useState<NetDraft>(emptyDraft);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!planVersion || !circle || prefilled) return;
    const prefill = prefillFromPlanVersion(planVersion, circle.name);
    setDraft((current) => ({
      ...current,
      name: prefill.name ?? current.name,
      channel: prefill.channel ?? current.channel,
      frequency: prefill.frequency ?? current.frequency,
      firstOccursOn: prefill.firstOccursOn ?? current.firstOccursOn,
      timeLocal: prefill.timeLocal ?? current.timeLocal,
      durationMinutes: prefill.durationMinutes ?? current.durationMinutes,
      procedureText: prefill.procedure?.join('\n') ?? current.procedureText,
    }));
    setPrefilled(true);
  }, [planVersion, circle, prefilled]);

  if (planId && planLoading) return <p className="text-sm text-ink/50">Loading plan details…</p>;

  async function handleSubmit() {
    const net = await createNet.mutateAsync({
      ...draftToInput(draft),
      sourcePlanVersionId: versionId,
    });
    void navigate(`/app/nets/${net.id}`);
  }

  return (
    <NetForm
      title={`Schedule a net${circle ? ` for ${circle.name}` : ''}`}
      subtitle={
        prefilled
          ? 'Pre-filled from your published plan\u2019s check-in schedule -- review and adjust before saving.'
          : 'A net is a recurring on-air check-in. Members see the schedule and can log their participation.'
      }
      draft={draft}
      onChange={setDraft}
      onSubmit={handleSubmit}
      submitLabel="Schedule net"
      pending={createNet.isPending}
      error={createNet.isError ? (createNet.error as Error).message : null}
      cancelTo={circleId ? `/app/circles/${circleId}` : '/app/nets'}
    />
  );
}

/** Edit form at /app/nets/:netId/edit. */
export function NetEditPage() {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const { data: net, isLoading, error } = useNet(netId);
  const updateNet = useUpdateNet(netId ?? '');
  const [draft, setDraft] = useState<NetDraft | null>(null);

  useEffect(() => {
    if (net) {
      setDraft({
        name: net.name,
        description: net.description ?? '',
        channel: net.channel,
        frequency: net.schedule.frequency,
        firstOccursOn: net.schedule.firstOccursOn,
        timeLocal: net.schedule.timeLocal,
        timezone: net.schedule.timezone,
        durationMinutes: net.schedule.durationMinutes,
        procedureText: net.procedure.join('\n'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net?.id]);

  if (isLoading || !draft) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !net) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Net not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">This net doesn&apos;t exist, or you don&apos;t have access.</p>
          <Link to="/app/nets" className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to Nets
          </Link>
        </Card>
      </div>
    );
  }
  if (!net.viewerCanManage) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>You can&apos;t edit this net</CardTitle>
          <p className="mt-2 text-sm text-ink/60">Only Circle coordinators can edit nets.</p>
          <Link to={`/app/nets/${net.id}`} className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to net
          </Link>
        </Card>
      </div>
    );
  }

  async function handleSubmit() {
    if (!draft) return;
    await updateNet.mutateAsync(draftToInput(draft));
    void navigate(`/app/nets/${netId}`);
  }

  return (
    <NetForm
      title={`Edit ${net.name}`}
      subtitle="Changes apply to future occurrences; past session logs are unaffected."
      draft={draft}
      onChange={(next) => setDraft(next)}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      pending={updateNet.isPending}
      error={updateNet.isError ? (updateNet.error as Error).message : null}
      cancelTo={`/app/nets/${netId}`}
    />
  );
}

function NetForm({
  title,
  subtitle,
  draft,
  onChange,
  onSubmit,
  submitLabel,
  pending,
  error,
  cancelTo,
}: {
  title: string;
  subtitle: string;
  draft: NetDraft;
  onChange: (draft: NetDraft) => void;
  onSubmit: () => Promise<void>;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  cancelTo: string;
}) {
  const patch = (fields: Partial<NetDraft>) => onChange({ ...draft, ...fields });
  const canSubmit =
    draft.name.trim().length > 0 &&
    draft.channel.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.firstOccursOn) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.timeLocal) &&
    draft.timezone.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
      </div>

      <Card>
        <CardTitle>Basics</CardTitle>
        <div className="mt-4 space-y-4">
          <Field label="Net name" required>
            {(id) => (
              <TextInput
                id={id}
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Sunday evening check-in"
              />
            )}
          </Field>
          <Field label="Channel" hint='How members should tune in, e.g. "FRS channel 3 (462.6125 MHz)".' required>
            {(id) => (
              <TextInput
                id={id}
                value={draft.channel}
                onChange={(event) => patch({ channel: event.target.value })}
                placeholder="FRS channel 3 (462.6125 MHz)"
              />
            )}
          </Field>
          <Field label="Description">
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="What this net is for and who should join."
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Schedule</CardTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Repeats" required>
            {(id) => (
              <Select
                id={id}
                value={draft.frequency}
                onChange={(event) => patch({ frequency: event.target.value as NetFrequency })}
              >
                {Object.entries(NET_FREQUENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="First occurrence"
            hint={draft.frequency === 'monthly' ? 'Monthly nets repeat on this date\u2019s weekday-of-month.' : undefined}
            required
          >
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={draft.firstOccursOn}
                onChange={(event) => patch({ firstOccursOn: event.target.value })}
              />
            )}
          </Field>
          <Field label="Start time (local)" required>
            {(id) => (
              <TextInput
                id={id}
                type="time"
                value={draft.timeLocal}
                onChange={(event) => patch({ timeLocal: event.target.value })}
              />
            )}
          </Field>
          <Field label="Timezone" hint="Defaults to your device's timezone." required>
            {(id) => (
              <Select id={id} value={draft.timezone} onChange={(event) => patch({ timezone: event.target.value })}>
                {/* Keep a stored value selectable even if this runtime doesn't list it. */}
                {!TIME_ZONES.includes(draft.timezone) && draft.timezone ? (
                  <option value={draft.timezone}>{draft.timezone}</option>
                ) : null}
                {TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Duration (minutes)" required>
            {(id) => (
              <TextInput
                id={id}
                type="number"
                min={5}
                max={480}
                value={draft.durationMinutes}
                onChange={(event) => patch({ durationMinutes: Number(event.target.value) || 30 })}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Net procedure</CardTitle>
        <p className="mt-1 text-xs text-ink/50">Optional. One step per line, in the order net control runs them.</p>
        <div className="mt-3">
          <TextArea
            aria-label="Net procedure"
            rows={5}
            value={draft.procedureText}
            onChange={(event) => patch({ procedureText: event.target.value })}
            placeholder={'Net control opens the net and calls for check-ins\nEach station checks in with name and location'}
          />
        </div>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={() => void onSubmit()} disabled={!canSubmit || pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Link to={cancelTo} className="text-sm text-ink/60 hover:text-navy-700">
          Cancel
        </Link>
      </div>
    </div>
  );
}
