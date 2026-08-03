import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STATION_TYPE_LABELS } from '@readycircle/contracts';
import { Badge, Card, EmptyState, cx } from '@readycircle/ui';
import { useStations } from '../../../features/stations/api.js';

export function StationsListPage() {
  const { data, isLoading } = useStations();
  const [showArchived, setShowArchived] = useState(false);

  const stations = data?.items ?? [];
  const activeStations = stations.filter((s) => s.status !== 'archived');
  const archivedStations = stations.filter((s) => s.status === 'archived');
  // Archived stations are muted noise most of the time -- keep them out of
  // the grid entirely until asked for, then tack them on at the end rather
  // than interleaving with everything the member actually uses.
  const visibleStations = showArchived ? [...activeStations, ...archivedStations] : activeStations;

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

      {archivedStations.length > 0 ? (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-black/20 text-navy-700 focus:ring-navy-600"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived ({archivedStations.length})
        </label>
      ) : null}

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
      ) : visibleStations.length === 0 ? (
        <EmptyState
          title="No active stations"
          description="All of your stations are archived."
          action={
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className="text-sm font-medium text-navy-700 hover:text-navy-800"
            >
              Show archived stations &rarr;
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleStations.map((station) => (
            <Link key={station.id} to={`/app/stations/${station.id}`}>
              <Card
                className={cx(
                  'h-full transition-colors hover:border-navy-300',
                  station.status === 'archived' && 'opacity-60 hover:opacity-100',
                )}
              >
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
