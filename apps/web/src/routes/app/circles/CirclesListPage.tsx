import { Link } from 'react-router-dom';
import { Card, EmptyState } from '@readycircle/ui';
import { useCircles } from '../../../features/circles/api.js';

export function CirclesListPage() {
  const { data, isLoading } = useCircles();
  const circles = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Radio Circles</h1>
          <p className="mt-1 text-sm text-ink/60">Groups of stations you communicate with.</p>
        </div>
        <Link
          to="/app/circles/new"
          className="inline-flex items-center justify-center rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
        >
          Create a Circle
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : circles.length === 0 ? (
        <EmptyState
          title="No Radio Circles yet"
          description="A Radio Circle connects your station with family, neighbors, or an organization."
          action={
            <Link to="/app/circles/new" className="text-sm font-medium text-navy-700 hover:text-navy-800">
              Create your first Circle &rarr;
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {circles.map((circle) => (
            <Link key={circle.id} to={`/app/circles/${circle.id}`}>
              <Card className="h-full transition-colors hover:border-navy-300">
                <h2 className="text-base font-semibold text-ink">{circle.name}</h2>
                <p className="mt-1 text-sm text-ink/60">{circle.circleTypeLabel}</p>
                <p className="mt-3 text-xs text-ink/50">
                  {circle.memberCount} member{circle.memberCount === 1 ? '' : 's'} &middot; {circle.area.areaLabel}
                </p>
                {circle.viewerRole === 'coordinator' ? (
                  <p className="mt-2 text-xs font-medium text-navy-700">You coordinate this Circle</p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
