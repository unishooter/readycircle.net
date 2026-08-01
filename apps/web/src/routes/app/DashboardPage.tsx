import { Link } from 'react-router-dom';
import { Badge, Card, CardDescription, CardTitle, EmptyState } from '@readycircle/ui';
import { useStations } from '../../features/stations/api.js';
import { useCircles } from '../../features/circles/api.js';
import { usePlans } from '../../features/plans/api.js';
import { VersionStatusBadge } from './plans/plan-status.js';

export function DashboardPage() {
  const { data: stationsData, isLoading: stationsLoading } = useStations();
  const { data: circlesData, isLoading: circlesLoading } = useCircles();
  const { data: plansData, isLoading: plansLoading } = usePlans();

  const stations = stationsData?.items ?? [];
  const circles = circlesData?.items ?? [];
  const plans = plansData?.items ?? [];

  const nextAction = stations.length === 0
    ? { label: 'Add your first station', to: '/app/stations/new' }
    : circles.length === 0
      ? { label: 'Create or join a Radio Circle', to: '/app/circles/new' }
      : plans[0] === undefined
        ? { label: 'Generate your first communications plan', to: '/app/plans' }
        : { label: 'Review your Circle plan', to: `/app/plans/${plans[0].id}` };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink/60">Your stations, Radio Circles, and next steps, all in one place.</p>
      </div>

      <Card className="border-navy-200 bg-navy-50/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-700">Suggested next step</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-medium text-ink">{nextAction.label}</p>
          <Link
            to={nextAction.to}
            className="inline-flex items-center justify-center rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
          >
            Go &rarr;
          </Link>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>My Stations</CardTitle>
            <Link to="/app/stations" className="text-sm font-medium text-navy-700 hover:text-navy-800">
              View all
            </Link>
          </div>
          {stationsLoading ? (
            <p className="mt-4 text-sm text-ink/50">Loading…</p>
          ) : stations.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No stations yet"
                description="Add your radio setup to start building a Radio Circle."
                action={
                  <Link to="/app/stations/new" className="text-sm font-medium text-navy-700 hover:text-navy-800">
                    Add a station &rarr;
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {stations.slice(0, 4).map((station) => (
                <li key={station.id}>
                  <Link
                    to={`/app/stations/${station.id}`}
                    className="flex items-center justify-between rounded-lg border border-black/5 px-4 py-3 hover:border-navy-300 hover:bg-navy-50"
                  >
                    <span className="text-sm font-medium text-ink">{station.name}</span>
                    <Badge tone={station.status === 'active' ? 'primary' : 'neutral'}>{station.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>My Radio Circles</CardTitle>
            <Link to="/app/circles" className="text-sm font-medium text-navy-700 hover:text-navy-800">
              View all
            </Link>
          </div>
          {circlesLoading ? (
            <p className="mt-4 text-sm text-ink/50">Loading…</p>
          ) : circles.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No Radio Circles yet"
                description={
                  stations.length === 0
                    ? 'Add a station first, then create or join a Circle.'
                    : 'Create a Circle to connect your station with others.'
                }
                action={
                  stations.length > 0 ? (
                    <Link to="/app/circles/new" className="text-sm font-medium text-navy-700 hover:text-navy-800">
                      Create a Circle &rarr;
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {circles.slice(0, 4).map((circle) => (
                <li key={circle.id}>
                  <Link
                    to={`/app/circles/${circle.id}`}
                    className="flex items-center justify-between rounded-lg border border-black/5 px-4 py-3 hover:border-navy-300 hover:bg-navy-50"
                  >
                    <span className="text-sm font-medium text-ink">{circle.name}</span>
                    <Badge tone="neutral">{circle.memberCount} member{circle.memberCount === 1 ? '' : 's'}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Plan status</CardTitle>
            <Link to="/app/plans" className="text-sm font-medium text-navy-700 hover:text-navy-800">
              View all
            </Link>
          </div>
          {plansLoading ? (
            <p className="mt-4 text-sm text-ink/50">Loading…</p>
          ) : plans.length === 0 ? (
            <CardDescription>
              No plans yet. Open one of your Radio Circles and choose &quot;Generate plan&quot;.
            </CardDescription>
          ) : (
            <ul className="mt-4 space-y-2">
              {plans.slice(0, 3).map((plan) => (
                <li key={plan.id}>
                  <Link
                    to={`/app/plans/${plan.id}`}
                    className="flex items-center justify-between rounded-lg border border-black/5 px-4 py-3 hover:border-navy-300 hover:bg-navy-50"
                  >
                    <span className="text-sm font-medium text-ink">{plan.title}</span>
                    <VersionStatusBadge version={plan.latestVersion} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Upcoming practice</CardTitle>
          <CardDescription>Scheduled check-ins and practice nets are coming in a future milestone.</CardDescription>
        </Card>
      </div>

      <Card>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>
          A feed of station and Circle changes will appear here as your Circles grow.
        </CardDescription>
      </Card>
    </div>
  );
}
