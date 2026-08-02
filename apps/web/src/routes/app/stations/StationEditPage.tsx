import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardTitle } from '@readycircle/ui';
import { useStation, useUpdateStation } from '../../../features/stations/api.js';
import { StationRepeatersCard } from '../../../features/repeaters/StationRepeatersCard.js';
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
import type { StationResponse } from '@readycircle/contracts';

function toDraft(station: StationResponse): StationFormDraft {
  return {
    name: station.name,
    stationType: station.stationType,
    status: station.status === 'hypothetical' ? 'hypothetical' : 'active',
    location: {
      areaLabel: station.location.areaLabel ?? undefined,
      latitude: station.location.latitude ?? undefined,
      longitude: station.location.longitude ?? undefined,
      precision: station.location.precision,
    },
    capabilities: station.capabilities,
    experienceLevel: station.experienceLevel ?? 'new',
    authorization: station.authorization ?? 'frs_user',
    goals: station.goals,
    participatesInScheduledChecks: station.participatesInScheduledChecks,
    willingToRelay: station.willingToRelay,
    willingToActAsNetControl: station.willingToActAsNetControl,
    receiveOnly: station.receiveOnly,
    visibility: station.visibility,
    transmitPowerWatts: station.transmitPowerWatts ?? undefined,
    antennaType: station.antennaType ?? undefined,
    antennaHeightFeet: station.antennaHeightFeet ?? undefined,
    backupPower: station.backupPower,
  };
}

/**
 * A single-page editor covering every section at once, unlike the
 * sequential creation wizard -- there's no reason to force an existing
 * station's owner back through a step-by-step flow just to fix one field.
 */
export function StationEditPage() {
  const { stationId } = useParams<{ stationId: string }>();
  const navigate = useNavigate();
  const { data: station, isLoading, error } = useStation(stationId);
  const updateStation = useUpdateStation(stationId ?? '');
  const [draft, setDraft] = useState<StationFormDraft | null>(null);

  useEffect(() => {
    // Initializes (or re-initializes, if navigating between two different
    // stations' edit pages without unmounting) once per station id, rather
    // than depending on the whole `station` object -- a query refetch that
    // returns a new-but-equal object every render would otherwise re-run
    // this effect indefinitely and stomp on in-progress edits.
    if (station) setDraft(toDraft(station));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id]);

  if (isLoading || !draft) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !station) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Station not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This station doesn&apos;t exist, or you don&apos;t have permission to edit it.
          </p>
          <Link to="/app/stations" className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to My Stations
          </Link>
        </Card>
      </div>
    );
  }
  if (!station.isOwner) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>You can&apos;t edit this station</CardTitle>
          <p className="mt-2 text-sm text-ink/60">Only the owner of a station can edit it.</p>
          <Link to={`/app/stations/${station.id}`} className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to station
          </Link>
        </Card>
      </div>
    );
  }

  function patchDraft(patch: Partial<StationFormDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function patchLocation(patch: Partial<StationFormDraft['location']>) {
    setDraft((current) => (current ? { ...current, location: { ...current.location, ...patch } } : current));
  }

  async function handleSave() {
    if (!draft) return;
    await updateStation.mutateAsync({
      ...draft,
      // Matches the create wizard's fallback: defaulting to FRS is
      // friendlier than a raw validation error if every checkbox gets
      // unchecked. Planned stations legitimately have no capabilities yet.
      capabilities:
        draft.capabilities.length > 0 ? draft.capabilities : draft.status === 'hypothetical' ? [] : ['frs'],
      // Explicit nulls clear stored values (undefined would merely omit them).
      transmitPowerWatts: draft.transmitPowerWatts ?? null,
      antennaType: draft.antennaType ?? null,
      antennaHeightFeet: draft.antennaHeightFeet ?? null,
    });
    navigate(`/app/stations/${stationId}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Edit {station.name}</h1>
        <p className="mt-1 text-sm text-ink/60">Changes save to this station immediately when you click Save.</p>
      </div>

      {station.status === 'hypothetical' ? (
        <Card>
          <CardTitle>Planned station</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This station has a location but no equipment yet — generated plans recommend the gear to get it on
            the air. Once it&apos;s equipped, mark it active below.
          </p>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => patchDraft({ status: 'active' })}
              disabled={draft.status === 'active'}
            >
              {draft.status === 'active' ? 'Will be marked active on save' : 'Mark as active'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Identity</CardTitle>
        <div className="mt-4">
          <StationIdentitySection draft={draft} onChange={patchDraft} />
        </div>
      </Card>

      <Card>
        <CardTitle>Location</CardTitle>
        <div className="mt-4">
          <StationLocationSection location={draft.location} onChange={patchLocation} />
        </div>
      </Card>

      <Card>
        <CardTitle>Capabilities</CardTitle>
        <div className="mt-4">
          <StationCapabilitiesSection draft={draft} onChange={patchDraft} />
        </div>
      </Card>

      <Card>
        <CardTitle>Antenna &amp; power</CardTitle>
        <div className="mt-4">
          <StationAntennaPowerSection draft={draft} onChange={patchDraft} />
        </div>
      </Card>

      {stationId ? <StationRepeatersCard stationId={stationId} /> : null}

      <Card>
        <CardTitle>Experience &amp; authorization</CardTitle>
        <div className="mt-4">
          <StationExperienceSection draft={draft} onChange={patchDraft} />
        </div>
      </Card>

      <Card>
        <CardTitle>Goals</CardTitle>
        <div className="mt-4">
          <StationGoalsSection draft={draft} onChange={patchDraft} />
        </div>
      </Card>

      <Card>
        <CardTitle>Participation &amp; privacy</CardTitle>
        <div className="mt-4">
          <StationParticipationPrivacySection draft={draft} onChange={patchDraft} />
        </div>
      </Card>

      {updateStation.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(updateStation.error as Error).message}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate(`/app/stations/${stationId}`)}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={updateStation.isPending}>
          {updateStation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
