import { Link } from 'react-router-dom';
import { connectivityContentSchema, type PlanResponse } from '@readycircle/contracts';
import { Badge, Card, CardTitle } from '@readycircle/ui';
import { usePlanVersion } from './api.js';

export interface CircleGearSummaryCardProps {
  /** The Circle's plans, newest first (as returned by the plans API). */
  plans: PlanResponse[];
}

/**
 * Surfaces the latest generated plan's connectivity verdict on the Circle
 * page: baseline relay pass/fail, station coverage counts, and top gaps.
 * Renders nothing until a plan version with a connectivity section exists.
 */
export function CircleGearSummaryCard({ plans }: CircleGearSummaryCardProps) {
  const latestReady = plans.find(
    (plan) => plan.latestVersion && plan.latestVersion.status !== 'failed' && plan.latestVersion.status !== 'generating',
  );
  const { data: version } = usePlanVersion(latestReady?.id, latestReady?.latestVersion?.id);

  const rawSection = version?.sections.find((section) => section.sectionKey === 'connectivity');
  const parsed = rawSection ? connectivityContentSchema.safeParse(rawSection.content) : null;
  if (!latestReady || !parsed?.success) return null;

  const connectivity = parsed.data;
  const stations = connectivity.stations;
  const attention = stations.filter((s) => s.role === 'isolated' || s.role === 'unknown');
  const covered = stations.length - attention.length;

  return (
    <Card className="sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Coverage &amp; gear check</CardTitle>
        <Badge tone={connectivity.baselineRelay.pass ? 'primary' : 'amber'}>
          {connectivity.baselineRelay.pass ? 'Baseline relay: pass' : 'Baseline relay: gaps found'}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-ink/80">{connectivity.baselineRelay.summary}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink/60">Stations analyzed</dt>
          <dd className="font-medium text-ink">{stations.length}</dd>
        </div>
        <div>
          <dt className="text-ink/60">Connected</dt>
          <dd className="font-medium text-ink">{covered}</dd>
        </div>
        <div>
          <dt className="text-ink/60">Need attention</dt>
          <dd className="font-medium text-ink">{attention.length}</dd>
        </div>
      </dl>
      {connectivity.gaps.length > 0 ? (
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-ink/70">
          {connectivity.gaps.slice(0, 3).map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      ) : null}
      <Link
        to={`/app/plans/${latestReady.id}`}
        className="mt-3 inline-block text-sm font-medium text-navy-700"
      >
        See the full connectivity analysis and gear recommendations &rarr;
      </Link>
    </Card>
  );
}
