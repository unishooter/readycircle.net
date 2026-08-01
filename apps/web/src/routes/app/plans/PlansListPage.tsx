import { Link } from 'react-router-dom';
import { Button, Card, EmptyState } from '@readycircle/ui';
import { usePlans } from '../../../features/plans/api.js';
import { useCircles } from '../../../features/circles/api.js';
import { VersionStatusBadge } from './plan-status.js';

export function PlansListPage() {
  const { data, isLoading, error } = usePlans();
  const { data: circlesData } = useCircles();

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load plans: {(error as Error).message}
      </p>
    );
  }

  const plans = data?.items ?? [];
  const circles = circlesData?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Plans</h1>
        <p className="mt-1 text-sm text-ink/60">
          Communications plans generated from your Radio Circles&apos; stations, capabilities, and roles.
        </p>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          title="No plans yet"
          description={
            circles.length === 0
              ? 'Plans are generated for a Radio Circle. Create or join a Circle first.'
              : 'Open one of your Radio Circles and choose "Generate plan" to create the first one.'
          }
          action={
            <Link to="/app/circles">
              <Button variant="secondary">Go to My Radio Circles</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Link key={plan.id} to={`/app/plans/${plan.id}`} className="block">
              <Card className="transition hover:border-navy-300 hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{plan.title}</p>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {plan.circleName}
                      {plan.latestVersion ? ` · Version ${plan.latestVersion.versionNumber}` : ''} · Updated{' '}
                      {new Date(plan.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <VersionStatusBadge version={plan.latestVersion} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
