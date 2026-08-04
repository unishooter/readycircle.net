import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ANTENNA_TYPE_LABELS,
  AUTHORIZATION_LABELS,
  BACKUP_POWER_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  RADIO_CAPABILITY_LABELS,
  STATION_GOAL_LABELS,
  STATION_STATUS_LABELS,
  STATION_TYPE_LABELS,
  STATION_VISIBILITY_LABELS,
} from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle } from '@readycircle/ui';
import { CONNECTIVITY_PATH_TYPE_LABELS } from '@readycircle/contracts';
import { useArchiveStation, useStation } from '../../../features/stations/api.js';
import { useStationContacts } from '../../../features/contacts/api.js';

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
          <Link to="/app/stations" className="mt-4 inline-block text-sm font-medium text-navy-700">
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
            <Badge tone={station.status === 'active' ? 'primary' : 'neutral'}>
              {STATION_STATUS_LABELS[station.status] ?? station.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            {STATION_TYPE_LABELS[station.stationType]}
            {station.callsign ? <> &middot; {station.callsign}</> : null}
          </p>
        </div>
        {station.isOwner && station.status !== 'archived' ? (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => navigate(`/app/stations/${station.id}/edit`)}>
              Edit
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleArchive()} disabled={archiveStation.isPending}>
              Archive station
            </Button>
          </div>
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
                <Badge key={capability} tone="primary">
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

        {station.transmitPowerWatts || station.antennaType || station.antennaHeightFeet || station.backupPower.length > 0 ? (
          <Card>
            <CardTitle>Antenna &amp; power</CardTitle>
            <dl className="mt-3 space-y-2 text-sm">
              {station.transmitPowerWatts ? (
                <div className="flex justify-between">
                  <dt className="text-ink/60">Transmit power</dt>
                  <dd className="font-medium text-ink">{station.transmitPowerWatts} W</dd>
                </div>
              ) : null}
              {station.antennaType ? (
                <div className="flex justify-between">
                  <dt className="text-ink/60">Antenna</dt>
                  <dd className="font-medium text-ink">{ANTENNA_TYPE_LABELS[station.antennaType]}</dd>
                </div>
              ) : null}
              {station.antennaHeightFeet ? (
                <div className="flex justify-between">
                  <dt className="text-ink/60">Antenna height</dt>
                  <dd className="font-medium text-ink">{station.antennaHeightFeet} ft</dd>
                </div>
              ) : null}
              {station.backupPower.length > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-ink/60">Backup power</dt>
                  <dd className="font-medium text-ink">
                    {station.backupPower.map((value) => BACKUP_POWER_LABELS[value]).join(', ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>
        ) : null}

        <Card>
          <CardTitle>Privacy</CardTitle>
          <p className="mt-3 text-sm text-ink/80">{STATION_VISIBILITY_LABELS[station.visibility]}</p>
        </Card>

        <Card>
          <CardTitle>Equipment</CardTitle>
          <p className="mt-3 text-sm text-ink/50">Equipment inventory is coming in a future milestone.</p>
        </Card>

        {station.isOwner ? <StationContactsCard stationId={station.id} /> : null}
      </div>
    </div>
  );
}

/** Read-only: full contact management happens from the Circle or the top-level Contacts page. */
function StationContactsCard({ stationId }: { stationId: string }) {
  const { data, isLoading } = useStationContacts(stationId);
  const contacts = data?.items ?? [];
  const recent = contacts.slice(0, 5);

  return (
    <Card>
      <CardTitle>Contacts</CardTitle>
      {isLoading ? (
        <p className="mt-3 text-sm text-ink/50">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="mt-3 text-sm text-ink/50">
          No contacts logged yet. Log one from a shared Circle&apos;s page.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {recent.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink/80">
                {contact.stationId === stationId ? contact.counterpartyStationName : contact.stationName}
              </span>
              <span className="shrink-0 text-xs text-ink/50">
                {new Date(contact.occurredAt).toLocaleDateString()} &middot;{' '}
                {CONNECTIVITY_PATH_TYPE_LABELS[contact.mode]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/app/contacts" className="mt-3 inline-block text-xs font-medium text-navy-700">
        View all contacts &rarr;
      </Link>
    </Card>
  );
}
