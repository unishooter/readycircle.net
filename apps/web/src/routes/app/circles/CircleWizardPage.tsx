import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CIRCLE_TYPE_LABELS,
  circleTypeSchema,
  type CreateCircleInput,
} from '@readycircle/contracts';
import { Button, Card, CheckboxOption, Field, Select, Stepper, TextArea, TextInput } from '@readycircle/ui';
import { useStations } from '../../../features/stations/api.js';
import { useCreateCircle } from '../../../features/circles/api.js';

const STEPS = ['Type', 'Identity', 'Area', 'Membership & privacy', 'Participating station', 'Review'];

type Draft = Omit<CreateCircleInput, 'creatorStationId'> & { creatorStationId: string };

const initialDraft: Draft = {
  circleType: 'neighborhood',
  name: '',
  shortDescription: '',
  purpose: '',
  area: { areaLabel: '' },
  isPrivate: true,
  requiresApproval: true,
  memberSharingPolicy: 'coordinators_only',
  creatorStationId: '',
};

export function CircleWizardPage() {
  const navigate = useNavigate();
  const { data: stationsData, isLoading: stationsLoading } = useStations();
  const createCircle = useCreateCircle();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);

  const stations = stationsData?.items.filter((s) => s.status === 'active') ?? [];
  const isLastStep = step === STEPS.length - 1;

  const canProceed =
    (step !== 1 || draft.name.trim().length > 0) &&
    (step !== 2 || draft.area.areaLabel.trim().length > 0) &&
    (step !== 4 || draft.creatorStationId.length > 0);

  if (!stationsLoading && stations.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <h1 className="text-lg font-semibold text-ink">Add a station first</h1>
          <p className="mt-2 text-sm text-ink/60">
            A Radio Circle connects stations together, so you&apos;ll need at least one active station
            before creating one.
          </p>
          <Link
            to="/app/stations/new"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
          >
            Add a station
          </Link>
        </Card>
      </div>
    );
  }

  async function handleSubmit() {
    const created = await createCircle.mutateAsync(draft);
    navigate(`/app/circles/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Create a Radio Circle</h1>
        <p className="mt-1 text-sm text-ink/60">You&apos;ll be the first coordinator of this Circle.</p>
      </div>

      <Stepper steps={STEPS} currentStep={step} />

      <Card>
        {step === 0 ? (
          <div className="space-y-3">
            {circleTypeSchema.options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 bg-white p-3 has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50"
              >
                <input
                  type="radio"
                  name="circleType"
                  className="h-4 w-4 border-black/20 text-navy-700 focus:ring-navy-600"
                  checked={draft.circleType === option}
                  onChange={() => setDraft({ ...draft, circleType: option })}
                />
                <span className="text-sm font-medium text-ink">{CIRCLE_TYPE_LABELS[option]}</span>
              </label>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <Field label="Circle name" required>
              {(id) => (
                <TextInput id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              )}
            </Field>
            <Field label="Short description" hint="A one-line summary, shown in listings.">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.shortDescription}
                  onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
                />
              )}
            </Field>
            <Field label="Purpose" hint="What is this Circle for?">
              {(id) => (
                <TextArea id={id} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} />
              )}
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <Field label="General area" required hint="A neighborhood, town, or region name.">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.area.areaLabel}
                  onChange={(e) => setDraft({ ...draft, area: { ...draft.area, areaLabel: e.target.value } })}
                />
              )}
            </Field>
            <Field label="Grid or locality label" hint="Optional -- a grid square or locality name.">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.area.gridOrLocalityLabel ?? ''}
                  onChange={(e) => setDraft({ ...draft, area: { ...draft.area, gridOrLocalityLabel: e.target.value } })}
                />
              )}
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <CheckboxOption
              label="Private Circle"
              description="Only visible to members; not discoverable publicly."
              checked={draft.isPrivate}
              onChange={(e) => setDraft({ ...draft, isPrivate: e.target.checked })}
            />
            <CheckboxOption
              label="Require coordinator approval to join"
              checked={draft.requiresApproval}
              onChange={(e) => setDraft({ ...draft, requiresApproval: e.target.checked })}
            />
            <Field label="Member list visibility">
              {(id) => (
                <Select
                  id={id}
                  value={draft.memberSharingPolicy}
                  onChange={(e) => setDraft({ ...draft, memberSharingPolicy: e.target.value as Draft['memberSharingPolicy'] })}
                >
                  <option value="coordinators_only">Coordinators only can see full member list</option>
                  <option value="all_members">All members can see the full member list</option>
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/60">Which of your stations will represent you in this Circle?</p>
            {stations.map((station) => (
              <label
                key={station.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 bg-white p-3 has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50"
              >
                <input
                  type="radio"
                  name="creatorStationId"
                  className="h-4 w-4 border-black/20 text-navy-700 focus:ring-navy-600"
                  checked={draft.creatorStationId === station.id}
                  onChange={() => setDraft({ ...draft, creatorStationId: station.id })}
                />
                <span className="text-sm font-medium text-ink">{station.name}</span>
              </label>
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-2 text-sm">
            <p className="text-ink/60">Review before creating your Circle.</p>
            <dl className="space-y-2">
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Type</dt>
                <dd className="font-medium text-ink">{CIRCLE_TYPE_LABELS[draft.circleType]}</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Name</dt>
                <dd className="font-medium text-ink">{draft.name || '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Area</dt>
                <dd className="font-medium text-ink">{draft.area.areaLabel || '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Your station</dt>
                <dd className="font-medium text-ink">
                  {stations.find((s) => s.id === draft.creatorStationId)?.name ?? 'Not selected'}
                </dd>
              </div>
            </dl>
            {createCircle.isError ? (
              <p role="alert" className="text-red-700">
                {(createCircle.error as Error).message}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {isLastStep ? (
          <Button onClick={() => void handleSubmit()} disabled={createCircle.isPending || !draft.creatorStationId}>
            {createCircle.isPending ? 'Creating…' : 'Create Circle'}
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canProceed}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
