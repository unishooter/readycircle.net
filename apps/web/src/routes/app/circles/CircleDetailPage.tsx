import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_SCENARIO, type MemberContact, type Scenario } from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle, Select } from '@readycircle/ui';
import {
  useAddMember,
  useCircle,
  useCircleMembers,
  useRemoveMember,
  useUpdateMember,
} from '../../../features/circles/api.js';
import { useStations } from '../../../features/stations/api.js';
import { useCirclePlans, useGeneratePlan } from '../../../features/plans/api.js';
import { useCircleNets } from '../../../features/nets/api.js';
import { CircleRepeatersCard } from '../../../features/repeaters/CircleRepeatersCard.js';
import { CircleGearSummaryCard } from '../../../features/plans/CircleGearSummaryCard.js';
import { ScenarioPicker } from '../../../features/plans/ScenarioPicker.js';
import { InviteCard } from '../../../features/invites/InviteCard.js';
import { CircleContactsCard } from '../../../features/contacts/CircleContactsCard.js';
import { CircleIdentifierBadge } from '../../../features/circles/CircleIdentifierBadge.js';
import { VersionStatusBadge } from '../plans/plan-status.js';
import { formatOccurrence } from '../nets/format.js';

/** Combines street/city/state/zip into one display line, gracefully handling any subset being shared. */
function formatSharedAddress(contact: MemberContact): string | null {
  const cityStateZip = [contact.city, [contact.state, contact.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const combined = [contact.address, cityStateZip].filter((part) => part && part.length > 0).join(', ');
  return combined || null;
}

export function CircleDetailPage() {
  const { circleId } = useParams<{ circleId: string }>();
  const navigate = useNavigate();
  const { data: circle, isLoading, error } = useCircle(circleId);
  const { data: membersData, isLoading: membersLoading } = useCircleMembers(circleId);
  const { data: stationsData } = useStations();
  const { data: plansData } = useCirclePlans(circleId);
  const { data: netsData } = useCircleNets(circleId);
  const addMember = useAddMember(circleId ?? '');
  const updateMember = useUpdateMember(circleId ?? '');
  const removeMember = useRemoveMember(circleId ?? '');
  const generatePlan = useGeneratePlan(circleId ?? '');
  const [selectedStationId, setSelectedStationId] = useState('');
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [expandedContactIds, setExpandedContactIds] = useState<Set<string>>(new Set());

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !circle) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Circle not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This Circle doesn&apos;t exist, or you&apos;re not a member.
          </p>
          <Link to="/app/circles" className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to My Radio Circles
          </Link>
        </Card>
      </div>
    );
  }

  const isCoordinator = circle.viewerRole === 'coordinator';
  const members = membersData?.items ?? [];
  const memberStationIds = new Set(members.map((m) => m.stationId));
  // Planned (hypothetical) stations may join too -- they only need a location
  // and exist precisely so the gear check can plan around them.
  const eligibleStations = (stationsData?.items ?? []).filter(
    (s) => (s.status === 'active' || s.status === 'hypothetical') && !memberStationIds.has(s.id),
  );

  const plans = plansData?.items ?? [];
  const anyPlanGenerating = plans.some((plan) => plan.latestVersion?.status === 'generating');
  const nets = netsData?.items ?? [];
  // Newest published plan version, used to prefill a net's schedule/channel.
  const publishedPlan = plans.find((plan) => plan.latestVersion?.status === 'published');

  async function handleAddMember() {
    if (!selectedStationId) return;
    await addMember.mutateAsync({ stationId: selectedStationId });
    setSelectedStationId('');
  }

  async function handleGeneratePlan() {
    const plan = await generatePlan.mutateAsync({ scenario });
    setScenarioOpen(false);
    navigate(`/app/plans/${plan.id}`);
  }

  function toggleContact(membershipId: string) {
    setExpandedContactIds((current) => {
      const next = new Set(current);
      if (next.has(membershipId)) next.delete(membershipId);
      else next.add(membershipId);
      return next;
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{circle.name}</h1>
            <Badge tone={circle.status === 'active' ? 'primary' : 'neutral'}>{circle.status}</Badge>
            <CircleIdentifierBadge identifier={circle.circleIdentifier} />
          </div>
          <p className="mt-1 text-sm text-ink/60">
            {circle.circleTypeLabel} &middot; {circle.area.areaLabel}
            {circle.area.gridIdentifier ? (
              <>
                {' '}
                &middot; Grid {circle.area.gridIdentifier}{' '}
                <span title="Approximate center of the Circle's general area, not its actual coverage.">ⓘ</span>
              </>
            ) : circle.area.gridOrLocalityLabel ? (
              <> &middot; {circle.area.gridOrLocalityLabel}</>
            ) : null}
          </p>
        </div>
        {isCoordinator ? (
          <Link to={`/app/circles/${circle.id}/edit`}>
            <Button variant="secondary" size="sm">
              Edit Circle
            </Button>
          </Link>
        ) : null}
      </div>

      {circle.shortDescription ? <p className="text-sm text-ink/80">{circle.shortDescription}</p> : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardTitle>Overview</CardTitle>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/60">Members</dt>
              <dd className="font-medium text-ink">{circle.memberCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/60">Coordinators</dt>
              <dd className="font-medium text-ink">{circle.coordinatorCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/60">Your role</dt>
              <dd className="font-medium text-ink">{circle.viewerRole ?? 'Not a member'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/60">Privacy</dt>
              <dd className="font-medium text-ink">{circle.isPrivate ? 'Private' : 'Not private'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardTitle>Communications plan</CardTitle>
          {plans.length === 0 ? (
            <>
              <p className="mt-3 text-sm text-ink/60">
                {isCoordinator
                  ? 'Generate a communications plan from this Circle\u2019s stations, capabilities, and roles.'
                  : 'No plan yet. A Circle coordinator can generate one.'}
              </p>
              {isCoordinator && !scenarioOpen ? (
                <Button className="mt-4" onClick={() => setScenarioOpen(true)} disabled={generatePlan.isPending}>
                  Generate plan
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {plans.slice(0, 3).map((plan) => (
                  <li key={plan.id}>
                    <Link
                      to={`/app/plans/${plan.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2 hover:border-navy-300 hover:bg-navy-50"
                    >
                      <span className="truncate text-sm font-medium text-ink">{plan.title}</span>
                      <VersionStatusBadge version={plan.latestVersion} />
                    </Link>
                  </li>
                ))}
              </ul>
              {isCoordinator && !scenarioOpen ? (
                <Button
                  className="mt-4"
                  variant="secondary"
                  size="sm"
                  onClick={() => setScenarioOpen(true)}
                  disabled={generatePlan.isPending || anyPlanGenerating}
                >
                  Generate another plan
                </Button>
              ) : null}
            </>
          )}
          {isCoordinator && scenarioOpen ? (
            <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
              <p className="text-xs font-medium text-ink/60">What scenario should this plan cover?</p>
              <ScenarioPicker value={scenario} onChange={setScenario} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleGeneratePlan()} disabled={generatePlan.isPending}>
                  {generatePlan.isPending ? 'Starting…' : 'Generate plan'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setScenarioOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {generatePlan.isError ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {(generatePlan.error as Error).message}
            </p>
          ) : null}
        </Card>

        <Card className="sm:col-span-2">
          <CardTitle>Nets</CardTitle>
          {nets.length === 0 ? (
            <p className="mt-3 text-sm text-ink/60">
              {isCoordinator
                ? 'Schedule a recurring on-air check-in so members can practice and log participation.'
                : 'No nets scheduled yet. A Circle coordinator can schedule one.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {nets.map((net) => (
                <li key={net.id}>
                  <Link
                    to={`/app/nets/${net.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2 hover:border-navy-300 hover:bg-navy-50"
                  >
                    <span className="truncate text-sm font-medium text-ink">{net.name}</span>
                    <span className="shrink-0 text-xs text-ink/50">
                      {net.nextOccurrences[0]
                        ? `Next: ${formatOccurrence(net.nextOccurrences[0])}`
                        : net.schedule.frequencyLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {isCoordinator ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {publishedPlan?.latestVersion ? (
                <Link
                  to={`/app/circles/${circle.id}/nets/new?planId=${publishedPlan.id}&versionId=${publishedPlan.latestVersion.id}`}
                >
                  <Button variant="secondary" size="sm">
                    Create from published plan
                  </Button>
                </Link>
              ) : null}
              <Link to={`/app/circles/${circle.id}/nets/new`}>
                <Button variant="secondary" size="sm">
                  Manually schedule a net
                </Button>
              </Link>
            </div>
          ) : null}
        </Card>

        <CircleGearSummaryCard plans={plans} />
      </div>

      <CircleRepeatersCard circleId={circle.id} isCoordinator={isCoordinator} />

      <CircleContactsCard circleId={circle.id} />

      <InviteCard circleId={circle.id} />

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Members</CardTitle>
        </div>

        {membersLoading ? (
          <p className="mt-4 text-sm text-ink/50">Loading…</p>
        ) : (
          <ul className="mt-4 divide-y divide-black/5">
            {members.map((member) => {
              const hasSharedContact =
                member.contact.email ||
                member.contact.phone ||
                member.contact.address ||
                member.contact.city ||
                member.contact.state ||
                member.contact.zip;
              const formattedAddress = formatSharedAddress(member.contact);
              const isExpanded = expandedContactIds.has(member.id);
              return (
                <li key={member.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink">{member.memberDisplayName}</p>
                        {member.stationStatus === 'hypothetical' ? <Badge tone="amber">Planned</Badge> : null}
                      </div>
                      <p className="text-xs text-ink/50">
                        {member.stationName} &middot; Joined {new Date(member.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isCoordinator ? (
                        <select
                          className="rounded-md border border-black/10 px-2 py-1 text-xs"
                          value={member.role}
                          onChange={(event) =>
                            void updateMember.mutateAsync({
                              membershipId: member.id,
                              input: { role: event.target.value as 'coordinator' | 'member' },
                            })
                          }
                        >
                          <option value="member">Member</option>
                          <option value="coordinator">Coordinator</option>
                        </select>
                      ) : (
                        <Badge tone={member.role === 'coordinator' ? 'primary' : 'neutral'}>{member.role}</Badge>
                      )}
                      {isCoordinator ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void removeMember.mutateAsync(member.id)}
                          disabled={removeMember.isPending}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {hasSharedContact ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-navy-700 hover:text-navy-800"
                        onClick={() => toggleContact(member.id)}
                      >
                        {isExpanded ? 'Hide contact info' : 'Show contact info'}
                      </button>
                      {isExpanded ? (
                        <dl className="mt-2 space-y-1 rounded-lg bg-navy-50/60 px-3 py-2 text-xs">
                          {member.contact.email ? (
                            <div className="flex gap-2">
                              <dt className="w-16 shrink-0 font-medium text-ink/50">Email</dt>
                              <dd className="text-ink/80">{member.contact.email}</dd>
                            </div>
                          ) : null}
                          {member.contact.phone ? (
                            <div className="flex gap-2">
                              <dt className="w-16 shrink-0 font-medium text-ink/50">Phone</dt>
                              <dd className="text-ink/80">{member.contact.phone}</dd>
                            </div>
                          ) : null}
                          {formattedAddress ? (
                            <div className="flex gap-2">
                              <dt className="w-16 shrink-0 font-medium text-ink/50">Address</dt>
                              <dd className="text-ink/80">{formattedAddress}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {removeMember.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {(removeMember.error as Error).message}
          </p>
        ) : null}
        {updateMember.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {(updateMember.error as Error).message}
          </p>
        ) : null}

        {eligibleStations.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-black/5 pt-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink/60" htmlFor="add-station">
                Add one of your stations
              </label>
              <Select id="add-station" value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)}>
                <option value="">Choose a station…</option>
                {eligibleStations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={() => void handleAddMember()} disabled={!selectedStationId || addMember.isPending}>
              Add
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
