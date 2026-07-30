import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AUTHORIZATION_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  LOCATION_PRECISION_LABELS,
  RADIO_CAPABILITY_LABELS,
  STATION_GOAL_LABELS,
  STATION_TYPE_LABELS,
  STATION_VISIBILITY_LABELS,
  authorizationSchema,
  experienceLevelSchema,
  locationPrecisionSchema,
  radioCapabilitySchema,
  stationGoalSchema,
  stationTypeSchema,
  stationVisibilitySchema,
  type CreateStationInput,
} from '@readycircle/contracts';
import { Button, Card, CheckboxOption, Field, RadioOption, Select, Stepper, TextInput } from '@readycircle/ui';
import { useCreateStation } from '../../../features/stations/api.js';

const STEPS = ['Identity', 'Location', 'Capability', 'Experience', 'Goals', 'Participation & privacy', 'Review'];

type DraftStation = CreateStationInput;

const initialDraft: DraftStation = {
  name: '',
  stationType: 'home',
  location: { precision: 'broad_area', areaLabel: '' },
  capabilities: [],
  experienceLevel: 'new',
  authorization: 'frs_user',
  goals: [],
  participatesInScheduledChecks: false,
  willingToRelay: false,
  willingToActAsNetControl: false,
  receiveOnly: false,
  visibility: 'private',
};

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function StationWizardPage() {
  const navigate = useNavigate();
  const createStation = useCreateStation();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DraftStation>(initialDraft);

  const isLastStep = step === STEPS.length - 1;
  const canProceed = step !== 0 || draft.name.trim().length > 0;

  async function handleSubmit() {
    const created = await createStation.mutateAsync({
      ...draft,
      capabilities: draft.capabilities.length > 0 ? draft.capabilities : ['frs'],
    });
    navigate(`/app/stations/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Add a station</h1>
        <p className="mt-1 text-sm text-ink/60">Takes about two minutes. You can edit everything later.</p>
      </div>

      <Stepper steps={STEPS} currentStep={step} />

      <Card>
        {step === 0 ? (
          <div className="space-y-4">
            <Field label="Station name" required hint="e.g. 'Home base' or 'Ana's Go-Kit'">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  autoFocus
                />
              )}
            </Field>
            <Field label="Station type" required>
              {(id) => (
                <Select
                  id={id}
                  value={draft.stationType}
                  onChange={(event) => setDraft({ ...draft, stationType: event.target.value as DraftStation['stationType'] })}
                >
                  {stationTypeSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {STATION_TYPE_LABELS[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <Field label="General area" hint="A neighborhood, town, or region name -- never your exact address.">
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.location.areaLabel ?? ''}
                  onChange={(event) => setDraft({ ...draft, location: { ...draft.location, areaLabel: event.target.value } })}
                  placeholder="e.g. Downtown Springfield"
                />
              )}
            </Field>
            <Field label="Display precision" required hint="Controls what others in your Circle can see. Your exact coordinates are never shared.">
              {(id) => (
                <Select
                  id={id}
                  value={draft.location.precision}
                  onChange={(event) => setDraft({ ...draft, location: { ...draft.location, precision: event.target.value as DraftStation['location']['precision'] } })}
                >
                  {locationPrecisionSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {LOCATION_PRECISION_LABELS[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {draft.location.precision === 'one_km_grid' ? (
              <Field label="Grid identifier" hint="e.g. a Maidenhead grid square like FN20QR">
                {(id) => (
                  <TextInput
                    id={id}
                    value={draft.location.gridIdentifier ?? ''}
                    onChange={(event) => setDraft({ ...draft, location: { ...draft.location, gridIdentifier: event.target.value } })}
                  />
                )}
              </Field>
            ) : null}
            <p className="text-xs text-ink/50">
              A map-based boundary picker is coming in a future milestone. For now, coordinates you enter here are
              stored privately and only ever shown to you.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/60">What can this station use? Select all that apply.</p>
            {radioCapabilitySchema.options.map((option) => (
              <CheckboxOption
                key={option}
                label={RADIO_CAPABILITY_LABELS[option]}
                checked={draft.capabilities.includes(option)}
                onChange={() => setDraft({ ...draft, capabilities: toggleValue(draft.capabilities, option) })}
              />
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <Field label="Experience level" required>
              {(id) => (
                <Select
                  id={id}
                  value={draft.experienceLevel}
                  onChange={(event) => setDraft({ ...draft, experienceLevel: event.target.value as DraftStation['experienceLevel'] })}
                >
                  {experienceLevelSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {EXPERIENCE_LEVEL_LABELS[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Authorization" required>
              {(id) => (
                <Select
                  id={id}
                  value={draft.authorization}
                  onChange={(event) => setDraft({ ...draft, authorization: event.target.value as DraftStation['authorization'] })}
                >
                  {authorizationSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {AUTHORIZATION_LABELS[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/60">What do you want to use this station for? Select all that apply.</p>
            {stationGoalSchema.options.map((option) => (
              <CheckboxOption
                key={option}
                label={STATION_GOAL_LABELS[option]}
                checked={draft.goals.includes(option)}
                onChange={() => setDraft({ ...draft, goals: toggleValue(draft.goals, option) })}
              />
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">Participation</p>
              <CheckboxOption
                label="Participate in scheduled check-ins"
                checked={draft.participatesInScheduledChecks}
                onChange={(event) => setDraft({ ...draft, participatesInScheduledChecks: event.target.checked })}
              />
              <CheckboxOption
                label="Willing to relay messages for others"
                checked={draft.willingToRelay}
                onChange={(event) => setDraft({ ...draft, willingToRelay: event.target.checked })}
              />
              <CheckboxOption
                label="Willing to act as net control"
                checked={draft.willingToActAsNetControl}
                onChange={(event) => setDraft({ ...draft, willingToActAsNetControl: event.target.checked })}
              />
              <CheckboxOption
                label="Receive-only (this station cannot transmit)"
                checked={draft.receiveOnly}
                onChange={(event) => setDraft({ ...draft, receiveOnly: event.target.checked })}
              />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">Who can see this station?</p>
              {stationVisibilitySchema.options.map((option) => (
                <RadioOption
                  key={option}
                  name="visibility"
                  label={STATION_VISIBILITY_LABELS[option]}
                  checked={draft.visibility === option}
                  onChange={() => setDraft({ ...draft, visibility: option })}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-4 text-sm">
            <p className="text-ink/60">Review your station before saving.</p>
            <dl className="space-y-2">
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Name</dt>
                <dd className="font-medium text-ink">{draft.name || '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Type</dt>
                <dd className="font-medium text-ink">{STATION_TYPE_LABELS[draft.stationType]}</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Area</dt>
                <dd className="font-medium text-ink">{draft.location.areaLabel || 'Not set'}</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Capabilities</dt>
                <dd className="font-medium text-ink">
                  {draft.capabilities.length > 0
                    ? draft.capabilities.map((c) => RADIO_CAPABILITY_LABELS[c]).join(', ')
                    : 'FRS (default)'}
                </dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Visibility</dt>
                <dd className="font-medium text-ink">{STATION_VISIBILITY_LABELS[draft.visibility]}</dd>
              </div>
            </dl>
            {createStation.isError ? (
              <p role="alert" className="text-red-700">
                {(createStation.error as Error).message}
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
          <Button onClick={() => void handleSubmit()} disabled={createStation.isPending}>
            {createStation.isPending ? 'Saving…' : 'Create station'}
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
