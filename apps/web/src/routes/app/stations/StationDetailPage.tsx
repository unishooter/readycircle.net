import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AUTHORIZATION_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  RADIO_CAPABILITY_LABELS,
  STATION_GOAL_LABELS,
  STATION_TYPE_LABELS,
  STATION_VISIBILITY_LABELS,
} from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle } from '@readycircle/ui';
import { useArchiveStation, useStation } from '../../../features/stations/api.js';

export function StationDetailPage() {
  const { stationId } = useParams<{ stationId: string }>();
  const navigate = useNavigate();
  const { data: station, isLoading, error } = useStation(stationId);
  const archiveStation = useArchiveStation();

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !station) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Station not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This station doesn&apos;t exist, or you don&apos;t have permission to view it.
          </p>
          <Link to="/app/stations" className="mt-4 inline-block text-sm font-medium text-teal-700">
            &larr; Back to My Stations
          </Link>
        </Card>
      </div>
    );
  }

  async function handleArchive() {
    if (!stationId) return;
    if (!window.confirm('Archive this station? It will be hidden but not deleted.')) return;
    await archiveStation.mutateAsync(stationId);
    navigate('/app/stations');
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{station.name}</h1>
            <Badge tone={station.status === 'active' ? 'teal' : 'neutral'}>{station.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink/60">{STATION_TYPE_LABELS[station.stationType]}</p>
        </div>
        {station.isOwner && station.status === 'active' ? (
          <Button variant="danger" size="sm" onClick={() => void handleArchive()} disabled={archiveStation.isPending}>
            Archive station
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardTitle>Location</CardTitle>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/60">Area</dt>
              <dd className="font-medium text-ink">{station.location.areaLabel ?? 'Hidden'}</dd>
            </div>
            {station.location.gridIdentifier ? (
              <div className="flex justify-between">
                <dt className="text-ink/60">Grid</dt>
                <dd className="font-medium text-ink">{station.location.gridIdentifier}</dd>
              </div>
            ) : null}
            {station.isOwner && station.location.latitude != null ? (
              <div className="flex justify-between">
                <dt className="text-ink/60">Coordinates (only visible to you)</dt>
                <dd className="font-medium text-ink">
                  {station.location.latitude.toFixed(4)}, {station.location.longitude?.toFixed(4)}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <CardTitle>Capabilities</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            {station.capabilities.length === 0 ? (
              <p className="text-sm text-ink/50">None listed</p>
            ) : (
              station.capabilities.map((capability) => (
                <Badge key={capability} tone="teal">
                  {RADIO_CAPABILITY_LABELS[capability]}
                </Badge>
              ))
            )}
          </div>
        </Card>

        {(station.experienceLevel || station.authorization) && (
          <Card>
            <CardTitle>Experience &amp; authorization</CardTitle>
            <dl className="mt-3 space-y-2 text-sm">
              {station.experienceLevel ? (
                <div className="flex justify-between">
                  <dt className="text-ink/60">Experience</dt>
                  <dd className="font-medium text-ink">{EXPERIENCE_LEVEL_LABELS[station.experienceLevel]}</dd>
                </div>
              ) : null}
              {station.authorization ? (
                <div className="flex justify-between">
                  <dt className="text-ink/60">Authorization</dt>
                  <dd className="font-medium text-ink">{AUTHORIZATION_LABELS[station.authorization]}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        )}

        {station.goals.length > 0 ? (
          <Card>
            <CardTitle>Goals</CardTitle>
            <ul className="mt-3 space-y-1 text-sm text-ink/80">
              {station.goals.map((goal) => (
                <li key={goal}>&bull; {STATION_GOAL_LABELS[goal]}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardTitle>Participation</CardTitle>
          <ul className="mt-3 space-y-1 text-sm text-ink/80">
            <li>Scheduled check-ins: {station.participatesInScheduledChecks ? 'Yes' : 'No'}</li>
            <li>Willing to relay: {station.willingToRelay ? 'Yes' : 'No'}</li>
            <li>Willing to be net control: {station.willingToActAsNetControl ? 'Yes' : 'No'}</li>
            <li>Receive-only: {station.receiveOnly ? 'Yes' : 'No'}</li>
          </ul>
        </Card>

        <Card>
          <CardTitle>Privacy</CardTitle>
          <p className="mt-3 text-sm text-ink/80">{STATION_VISIBILITY_LABELS[station.visibility]}</p>
        </Card>

        <Card>
          <CardTitle>Equipment</CardTitle>
          <p className="mt-3 text-sm text-ink/50">Equipment inventory is coming in a future milestone.</p>
        </Card>
      </div>
    </div>
  );
}
