import { Link } from 'react-router-dom';
import { STATION_TYPE_LABELS } from '@readycircle/contracts';
import { Badge, Card, EmptyState } from '@readycircle/ui';
import { useStations } from '../../../features/stations/api.js';

export function StationsListPage() {
  const { data, isLoading } = useStations();
  const stations = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Stations</h1>
          <p className="mt-1 text-sm text-ink/60">Every radio setup you&apos;ve registered with ReadyCircle.</p>
        </div>
        <Link
          to="/app/stations/new"
          className="inline-flex items-center justify-center rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
        >
          Add a station
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : stations.length === 0 ? (
        <EmptyState
          title="No stations yet"
          description="A station represents one radio setup -- your home base, a handheld, or an organization's fixed station."
          action={
            <Link to="/app/stations/new" className="text-sm font-medium text-navy-700 hover:text-navy-800">
              Add your first station &rarr;
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <Link key={station.id} to={`/app/stations/${station.id}`}>
              <Card className="h-full transition-colors hover:border-navy-300">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-ink">{station.name}</h2>
                  <Badge
                    tone={
                      station.status === 'active' ? 'primary' : station.status === 'hypothetical' ? 'amber' : 'neutral'
                    }
                  >
                    {station.status === 'hypothetical' ? 'planned' : station.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink/60">{STATION_TYPE_LABELS[station.stationType]}</p>
                <p className="mt-3 text-xs text-ink/50">
                  {station.location.areaLabel ?? 'Location not shared'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
