import { Badge, Card, CardTitle } from '@readycircle/ui';
import {
  channelPlanContentSchema,
  checkInScheduleContentSchema,
  connectivityContentSchema,
  CONNECTIVITY_PATH_TYPE_LABELS,
  CONNECTIVITY_VERDICT_LABELS,
  GEAR_PRIORITY_LABELS,
  gearRecommendationsContentSchema,
  planOverviewContentSchema,
  planRosterContentSchema,
  recommendationsContentSchema,
  roleAssignmentsContentSchema,
  type ConnectivityVerdict,
  type GearRecommendation,
  type PlanSectionResponse,
} from '@readycircle/contracts';

/**
 * Renders a plan section from its stored JSON content. Each known section
 * key gets a purpose-built layout; content that fails schema validation
 * falls back to raw JSON so a rendering mismatch never hides plan data.
 */
export function PlanSectionView({ section }: { section: PlanSectionResponse }) {
  return (
    <Card>
      <CardTitle>{section.title}</CardTitle>
      <div className="mt-3">
        <SectionBody section={section} />
      </div>
    </Card>
  );
}

function SectionBody({ section }: { section: PlanSectionResponse }) {
  switch (section.sectionKey) {
    case 'overview':
      return <OverviewBody content={section.content} />;
    case 'roster':
      return <RosterBody content={section.content} />;
    case 'connectivity':
      return <ConnectivityBody content={section.content} />;
    case 'gear_recommendations':
      return <GearRecommendationsBody content={section.content} />;
    case 'channel_plan':
      return <ChannelPlanBody content={section.content} />;
    case 'role_assignments':
      return <RoleAssignmentsBody content={section.content} />;
    case 'check_in_schedule':
      return <CheckInScheduleBody content={section.content} />;
    case 'recommendations':
      return <RecommendationsBody content={section.content} />;
    default:
      return <RawBody content={section.content} />;
  }
}

function RawBody({ content }: { content: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-black/5 p-3 text-xs text-ink/70">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

function OverviewBody({ content }: { content: unknown }) {
  const parsed = planOverviewContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  const overview = parsed.data;
  return (
    <div className="space-y-2 text-sm text-ink/80">
      <p>
        <span className="font-medium text-ink">{overview.circleName}</span> — {overview.circleTypeLabel},
        covering {overview.areaLabel}. {overview.memberCount} participating station
        {overview.memberCount === 1 ? '' : 's'}.
      </p>
      {overview.purpose ? <p>{overview.purpose}</p> : null}
      {overview.scenarioDescription ? (
        <p>
          <span className="font-medium text-ink">Scenario:</span> {overview.scenarioDescription}
        </p>
      ) : null}
      <p className="text-xs text-ink/50">Generated {new Date(overview.generatedAt).toLocaleString()}</p>
    </div>
  );
}

function RosterBody({ content }: { content: unknown }) {
  const parsed = planRosterContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-ink/50">
            <th className="py-2 pr-3 font-medium">Station / operator</th>
            <th className="py-2 pr-3 font-medium">Capabilities</th>
            <th className="py-2 pr-3 font-medium">Location</th>
            <th className="py-2 font-medium">Participation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {parsed.data.entries.map((entry) => {
            const participation = [
              entry.willingToActAsNetControl ? 'Net control' : null,
              entry.willingToRelay ? 'Relay' : null,
              entry.participatesInScheduledChecks ? 'Check-ins' : null,
              entry.receiveOnly ? 'Receive only' : null,
            ].filter(Boolean);
            const location = [entry.areaLabel, entry.gridIdentifier].filter(Boolean).join(' · ');
            return (
              <tr key={entry.stationId}>
                <td className="py-2 pr-3">
                  <p className="font-medium text-ink">{entry.stationName}</p>
                  <p className="text-xs text-ink/50">
                    {entry.operatorName} · {entry.circleRoleLabel}
                  </p>
                </td>
                <td className="py-2 pr-3 text-ink/80">{entry.capabilityLabels.join(', ') || '—'}</td>
                <td className="py-2 pr-3 text-ink/80">{location || 'Not shared'}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {participation.length > 0 ? (
                      participation.map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const VERDICT_TONE: Record<ConnectivityVerdict, 'primary' | 'neutral' | 'amber' | 'red'> = {
  likely: 'primary',
  marginal: 'amber',
  unlikely: 'red',
  unknown: 'neutral',
};

const STATION_ROLE_LABELS: Record<string, string> = {
  connected: 'Connected',
  edge: 'Edge (one path)',
  isolated: 'Isolated',
  unknown: 'Location needed',
};

function ConnectivityBody({ content }: { content: unknown }) {
  const parsed = connectivityContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  const connectivity = parsed.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/80">{connectivity.narrative}</p>

      <div
        className={`rounded-md border p-3 ${
          connectivity.baselineRelay.pass ? 'border-navy-200 bg-navy-50/60' : 'border-amber-200 bg-amber-50/60'
        }`}
      >
        <div className="flex items-center gap-2">
          <Badge tone={connectivity.baselineRelay.pass ? 'primary' : 'amber'}>
            {connectivity.baselineRelay.pass ? 'Baseline relay: pass' : 'Baseline relay: gaps found'}
          </Badge>
          {connectivity.baselineRelay.hubStationNames.length > 0 ? (
            <span className="text-xs text-ink/60">
              Hub{connectivity.baselineRelay.hubStationNames.length === 1 ? '' : 's'}:{' '}
              {connectivity.baselineRelay.hubStationNames.join(', ')}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-ink/80">{connectivity.baselineRelay.summary}</p>
      </div>

      {connectivity.stations.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="py-2 pr-3 font-medium">Station</th>
                <th className="py-2 pr-3 font-medium">Coverage</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {connectivity.stations.map((station) => (
                <tr key={station.stationId}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{station.stationName}</span>
                      {station.hypothetical ? <Badge tone="amber">Planned</Badge> : null}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={station.role === 'connected' ? 'primary' : station.role === 'unknown' ? 'neutral' : 'amber'}>
                      {STATION_ROLE_LABELS[station.role] ?? station.role}
                    </Badge>
                    <span className="ml-2 text-xs text-ink/50">
                      reaches {station.reachableStationCount} station{station.reachableStationCount === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-ink/60">{station.notes.join(' ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {connectivity.links.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="py-2 pr-3 font-medium">Link</th>
                <th className="py-2 pr-3 font-medium">Path</th>
                <th className="py-2 pr-3 font-medium">Distance</th>
                <th className="py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {connectivity.links.map((link, index) => (
                <tr key={index}>
                  <td className="py-2 pr-3 text-ink">
                    {link.fromStationName} &harr; {link.toStationName}
                  </td>
                  <td className="py-2 pr-3 text-ink/80">
                    {CONNECTIVITY_PATH_TYPE_LABELS[link.pathType]}
                    {link.viaRepeaterName ? (
                      <span className="text-xs text-ink/50"> ({link.viaRepeaterName})</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-ink/80">{link.distanceKm !== null ? `~${link.distanceKm} km` : '—'}</td>
                  <td className="py-2">
                    <Badge tone={VERDICT_TONE[link.verdict]}>{CONNECTIVITY_VERDICT_LABELS[link.verdict]}</Badge>
                    {link.detail ? <p className="mt-0.5 text-xs text-ink/50">{link.detail}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {connectivity.gaps.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Coverage gaps</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-ink/70">
            {connectivity.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {connectivity.repeatersConsidered.length > 0 ? (
        <p className="text-xs text-ink/50">
          Repeaters considered: {connectivity.repeatersConsidered.join(', ')}
        </p>
      ) : null}
    </div>
  );
}

const GEAR_PRIORITY_TONE: Record<GearRecommendation['priority'], 'red' | 'primary' | 'neutral'> = {
  essential: 'red',
  recommended: 'primary',
  nice_to_have: 'neutral',
};

function GearRecommendationsBody({ content }: { content: unknown }) {
  const parsed = gearRecommendationsContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/80">{parsed.data.narrative}</p>
      <ul className="space-y-2">
        {parsed.data.items.map((item, index) => (
          <li key={index} className="rounded-md border border-black/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={GEAR_PRIORITY_TONE[item.priority]}>{GEAR_PRIORITY_LABELS[item.priority]}</Badge>
              <span className="text-sm font-medium text-ink">
                {item.stationName ?? 'Circle-wide'}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink">{item.recommendation}</p>
            <p className="mt-0.5 text-xs text-ink/60">Addresses: {item.gap}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelPlanBody({ content }: { content: unknown }) {
  const parsed = channelPlanContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/80">{parsed.data.narrative}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-ink/50">
              <th className="py-2 pr-3 font-medium">Use</th>
              <th className="py-2 pr-3 font-medium">Service</th>
              <th className="py-2 pr-3 font-medium">Channel / frequency</th>
              <th className="py-2 font-medium">Who can use it</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {parsed.data.entries.map((entry, index) => (
              <tr key={index}>
                <td className="py-2 pr-3 capitalize text-ink">{entry.purpose}</td>
                <td className="py-2 pr-3 text-ink/80">{entry.service}</td>
                <td className="py-2 pr-3 font-medium text-ink">{entry.channelOrFrequency}</td>
                <td className="py-2 text-ink/80">
                  {entry.whoCanUse}
                  {entry.notes ? <p className="text-xs text-ink/50">{entry.notes}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  net_control: 'Net control',
  backup_net_control: 'Backup net control',
  relay: 'Relay',
};

function RoleAssignmentsBody({ content }: { content: unknown }) {
  const parsed = roleAssignmentsContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/80">{parsed.data.narrative}</p>
      <ul className="space-y-2">
        {parsed.data.assignments.map((assignment, index) => (
          <li key={index} className="rounded-md border border-black/5 bg-black/[0.02] p-3">
            <div className="flex items-center gap-2">
              <Badge tone="primary">{ROLE_LABELS[assignment.role] ?? assignment.role}</Badge>
              <span className="text-sm font-medium text-ink">{assignment.stationName}</span>
            </div>
            <p className="mt-1 text-xs text-ink/60">{assignment.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckInScheduleBody({ content }: { content: unknown }) {
  const parsed = checkInScheduleContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  const schedule = parsed.data;
  return (
    <div className="space-y-3 text-sm text-ink/80">
      <p>{schedule.narrative}</p>
      <p>
        <span className="font-medium text-ink">{schedule.cadence}</span> — {schedule.dayAndTime} (about{' '}
        {schedule.durationMinutes} minutes).
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        {schedule.procedure.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

const SEVERITY_TONE: Record<string, 'primary' | 'neutral' | 'amber'> = {
  info: 'neutral',
  advisory: 'primary',
  important: 'amber',
};

function RecommendationsBody({ content }: { content: unknown }) {
  const parsed = recommendationsContentSchema.safeParse(content);
  if (!parsed.success) return <RawBody content={content} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/80">{parsed.data.narrative}</p>
      <ul className="space-y-2">
        {parsed.data.items.map((item, index) => (
          <li key={index} className="rounded-md border border-black/5 p-3">
            <div className="flex items-center gap-2">
              <Badge tone={SEVERITY_TONE[item.severity] ?? 'neutral'}>{item.severity}</Badge>
              <span className="text-sm font-medium text-ink">{item.title}</span>
            </div>
            <p className="mt-1 text-sm text-ink/70">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
