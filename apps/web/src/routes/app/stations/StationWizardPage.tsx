import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AUTHORIZATION_LABELS,
  RADIO_CAPABILITY_LABELS,
  STATION_TYPE_LABELS,
  STATION_VISIBILITY_LABELS,
} from '@readycircle/contracts';
import { Button, Card, Stepper } from '@readycircle/ui';
import { useCreateStation } from '../../../features/stations/api.js';
import {
  StationCapabilitiesSection,
  StationExperienceSection,
  StationGoalsSection,
  StationIdentitySection,
  StationLocationSection,
  StationParticipationPrivacySection,
  type StationFormDraft,
} from '../../../features/stations/form-sections/index.js';

const STEPS = ['Identity', 'Location', 'Capability', 'Experience', 'Goals', 'Participation & privacy', 'Review'];

const initialDraft: StationFormDraft = {
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

export function StationWizardPage() {
  const navigate = useNavigate();
  const createStation = useCreateStation();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StationFormDraft>(initialDraft);

  const isLastStep = step === STEPS.length - 1;
  const canProceed = step !== 0 || draft.name.trim().length > 0;

  function patchDraft(patch: Partial<StationFormDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function patchLocation(patch: Partial<StationFormDraft['location']>) {
    setDraft((current) => ({ ...current, location: { ...current.location, ...patch } }));
  }

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
        {step === 0 ? <StationIdentitySection draft={draft} onChange={patchDraft} autoFocusName /> : null}
        {step === 1 ? <StationLocationSection location={draft.location} onChange={patchLocation} /> : null}
        {step === 2 ? <StationCapabilitiesSection draft={draft} onChange={patchDraft} /> : null}
        {step === 3 ? <StationExperienceSection draft={draft} onChange={patchDraft} /> : null}
        {step === 4 ? <StationGoalsSection draft={draft} onChange={patchDraft} /> : null}
        {step === 5 ? <StationParticipationPrivacySection draft={draft} onChange={patchDraft} /> : null}

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
                <dt className="text-ink/60">Authorization</dt>
                <dd className="font-medium text-ink">{AUTHORIZATION_LABELS[draft.authorization]}</dd>
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
