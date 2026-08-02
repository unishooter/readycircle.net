import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState } from '@readycircle/ui';
import { useNets } from '../../../features/nets/api.js';
import { useCircles } from '../../../features/circles/api.js';
import { formatOccurrence } from './format.js';

export function NetsListPage() {
  const { data, isLoading, error } = useNets();
  const { data: circlesData } = useCircles();

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load nets: {(error as Error).message}
      </p>
    );
  }

  const nets = data?.items ?? [];
  const circles = circlesData?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Nets</h1>
        <p className="mt-1 text-sm text-ink/60">
          Scheduled on-air check-ins for your Radio Circles, with session logs and participation history.
        </p>
      </div>

      {nets.length === 0 ? (
        <EmptyState
          title="No nets scheduled yet"
          description={
            circles.length === 0
              ? 'Nets belong to a Radio Circle. Create or join a Circle first.'
              : 'Open one of your Radio Circles and choose "Schedule a net" -- or create one from a published plan\u2019s check-in schedule.'
          }
          action={
            <Link to="/app/circles">
              <Button variant="secondary">Go to My Radio Circles</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {nets.map((net) => (
            <Link key={net.id} to={`/app/nets/${net.id}`} className="block">
              <Card className="transition hover:border-navy-300 hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{net.name}</p>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {net.circleName} · {net.channel} · {net.schedule.frequencyLabel}
                    </p>
                  </div>
                  {net.nextOccurrences[0] ? (
                    <Badge tone="primary">Next: {formatOccurrence(net.nextOccurrences[0])}</Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
