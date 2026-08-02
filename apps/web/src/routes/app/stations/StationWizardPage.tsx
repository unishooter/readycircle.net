import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AUTHORIZATION_LABELS,
  RADIO_CAPABILITY_LABELS,
  STATION_TYPE_LABELS,
  STATION_VISIBILITY_LABELS,
} from '@readycircle/contracts';
import { Button, Card, CheckboxOption, Stepper } from '@readycircle/ui';
import { useCreateStation } from '../../../features/stations/api.js';
import { useAcceptInvite } from '../../../features/invites/api.js';
import {
  StationAntennaPowerSection,
  StationCapabilitiesSection,
  StationExperienceSection,
  StationGoalsSection,
  StationIdentitySection,
  StationLocationSection,
  StationParticipationPrivacySection,
  type StationFormDraft,
} from '../../../features/stations/form-sections/index.js';

const FULL_STEPS = [
  'Identity',
  'Location',
  'Capability',
  'Antenna & power',
  'Experience',
  'Goals',
  'Participation & privacy',
  'Review',
];

// A planned station has no equipment yet -- only identity and location
// matter, and the gear-check plan recommends what to buy for it.
const PLANNED_STEPS = ['Identity', 'Location', 'Review'];

const initialDraft: StationFormDraft = {
  name: '',
  stationType: 'home',
  status: 'active',
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
  backupPower: [],
};

export function StationWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Present when arriving from an invite link (see InvitePreviewPage) --
  // on save, the new station joins that Circle instead of landing on the
  // ordinary station detail page.
  const inviteToken = searchParams.get('inviteToken') ?? undefined;
  const createStation = useCreateStation();
  const acceptInvite = useAcceptInvite(inviteToken);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StationFormDraft>(initialDraft);

  const isPlanned = draft.status === 'hypothetical';
  const steps = isPlanned ? PLANNED_STEPS : FULL_STEPS;
  const stepName = steps[Math.min(step, steps.length - 1)];
  const isLastStep = step === steps.length - 1;
  const canProceed = stepName !== 'Identity' || draft.name.trim().length > 0;

  function patchDraft(patch: Partial<StationFormDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function patchLocation(patch: Partial<StationFormDraft['location']>) {
    setDraft((current) => ({ ...current, location: { ...current.location, ...patch } }));
  }

  async function handleSubmit() {
    const created = await createStation.mutateAsync({
      ...draft,
      capabilities:
        draft.capabilities.length > 0 ? draft.capabilities : isPlanned ? [] : ['frs'],
    });
    if (inviteToken) {
      const invite = await acceptInvite.mutateAsync({ stationId: created.id });
      navigate(`/app/circles/${invite.circleId}`);
      return;
    }
    navigate(`/app/stations/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Add a station</h1>
        <p className="mt-1 text-sm text-ink/60">Takes about two minutes. You can edit everything later.</p>
      </div>

      <Stepper steps={steps} currentStep={step} />

      <Card>
        {stepName === 'Identity' ? (
          <div className="space-y-4">
            <StationIdentitySection draft={draft} onChange={patchDraft} autoFocusName />
            <CheckboxOption
              label="This is a planned station (no equipment yet)"
              description="Just pick a location — generated plans will recommend the gear to get it on the air."
              checked={isPlanned}
              onChange={(event) => {
                patchDraft({ status: event.target.checked ? 'hypothetical' : 'active' });
                setStep(0);
              }}
            />
          </div>
        ) : null}
        {stepName === 'Location' ? <StationLocationSection location={draft.location} onChange={patchLocation} /> : null}
        {stepName === 'Capability' ? <StationCapabilitiesSection draft={draft} onChange={patchDraft} /> : null}
        {stepName === 'Antenna & power' ? <StationAntennaPowerSection draft={draft} onChange={patchDraft} /> : null}
        {stepName === 'Experience' ? <StationExperienceSection draft={draft} onChange={patchDraft} /> : null}
        {stepName === 'Goals' ? <StationGoalsSection draft={draft} onChange={patchDraft} /> : null}
        {stepName === 'Participation & privacy' ? (
          <StationParticipationPrivacySection draft={draft} onChange={patchDraft} />
        ) : null}

        {stepName === 'Review' ? (
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
              {isPlanned ? (
                <div className="flex justify-between border-b border-black/5 pb-2">
                  <dt className="text-ink/60">Status</dt>
                  <dd className="font-medium text-ink">Planned (no equipment yet)</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-b border-black/5 pb-2">
                <dt className="text-ink/60">Area</dt>
                <dd className="font-medium text-ink">{draft.location.areaLabel || 'Not set'}</dd>
              </div>
              {!isPlanned ? (
                <>
                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <dt className="text-ink/60">Capabilities</dt>
                    <dd className="font-medium text-ink">
                      {draft.capabilities.length > 0
                        ? draft.capabilities.map((c) => RADIO_CAPABILITY_LABELS[c]).join(', ')
                        : 'FRS (default)'}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <dt className="text-ink/60">Antenna &amp; power</dt>
                    <dd className="font-medium text-ink">
                      {[
                        draft.transmitPowerWatts ? `${draft.transmitPowerWatts} W` : null,
                        draft.antennaHeightFeet ? `${draft.antennaHeightFeet} ft antenna` : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Defaults'}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <dt className="text-ink/60">Authorization</dt>
                    <dd className="font-medium text-ink">
                      {draft.authorization ? AUTHORIZATION_LABELS[draft.authorization] : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
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
            {acceptInvite.isError ? (
              <p role="alert" className="text-red-700">
                {(acceptInvite.error as Error).message}
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
          <Button onClick={() => void handleSubmit()} disabled={createStation.isPending || acceptInvite.isPending}>
            {createStation.isPending || acceptInvite.isPending
              ? 'Saving…'
              : inviteToken
                ? 'Create station & join Circle'
                : 'Create station'}
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={!canProceed}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
