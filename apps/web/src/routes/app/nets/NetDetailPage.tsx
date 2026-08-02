import { Link, useNavigate, useParams } from 'react-router-dom';
import type { NetDetailResponse, NetSessionResponse } from '@readycircle/contracts';
import { Badge, Button, Card, CardTitle } from '@readycircle/ui';
import {
  useArchiveNet,
  useCloseSession,
  useNet,
  useOpenSession,
  useRecordCheckin,
  useRemoveCheckin,
} from '../../../features/nets/api.js';
import { useStations } from '../../../features/stations/api.js';
import { formatOccurrence } from './format.js';

export function NetDetailPage() {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const { data: net, isLoading, error } = useNet(netId);
  const { data: stationsData } = useStations();
  const openSession = useOpenSession(netId ?? '');
  const archiveNet = useArchiveNet(netId ?? '');

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !net) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Net not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This net doesn&apos;t exist, or you&apos;re not a member of its Radio Circle.
          </p>
          <Link to="/app/nets" className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to Nets
          </Link>
        </Card>
      </div>
    );
  }

  const myStationIds = new Set((stationsData?.items ?? []).map((station) => station.id));
  const activeSession = net.sessions.find((session) => session.status === 'open') ?? null;

  async function handleArchive() {
    if (!window.confirm('Archive this net? It will no longer appear in upcoming schedules.')) return;
    await archiveNet.mutateAsync();
    void navigate('/app/nets');
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs text-ink/50">
          <Link to="/app/nets" className="hover:text-navy-700">
            Nets
          </Link>{' '}
          /{' '}
          <Link to={`/app/circles/${net.circleId}`} className="hover:text-navy-700">
            {net.circleName}
          </Link>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">{net.name}</h1>
          {activeSession ? <Badge tone="primary">On the air</Badge> : null}
        </div>
        {net.description ? <p className="mt-1 text-sm text-ink/60">{net.description}</p> : null}
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Schedule</CardTitle>
            <p className="mt-2 text-sm text-ink/80">
              {net.schedule.frequencyLabel} at {net.schedule.timeLocal} ({net.schedule.timezone}) ·{' '}
              {net.schedule.durationMinutes} minutes · {net.channel}
            </p>
            {net.nextOccurrences.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Upcoming</p>
                <ul className="mt-1 space-y-0.5 text-sm text-ink/80">
                  {net.nextOccurrences.map((occurrence) => (
                    <li key={occurrence}>{formatOccurrence(occurrence)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {net.viewerCanRunSession && !activeSession ? (
              <Button onClick={() => void openSession.mutateAsync({})} disabled={openSession.isPending}>
                Start session
              </Button>
            ) : null}
            {net.viewerCanManage ? (
              <>
                <Link to={`/app/nets/${net.id}/edit`}>
                  <Button variant="secondary">Edit</Button>
                </Link>
                <Button variant="secondary" onClick={() => void handleArchive()} disabled={archiveNet.isPending}>
                  Archive
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {openSession.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {(openSession.error as Error).message}
          </p>
        ) : null}
        {net.procedure.length > 0 ? (
          <div className="mt-4 border-t border-black/5 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Net procedure</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-ink/80">
              {net.procedure.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </Card>

      {activeSession ? <ActiveSessionCard net={net} session={activeSession} myStationIds={myStationIds} /> : null}

      <ParticipationCard net={net} />

      <SessionHistoryCard net={net} />
    </div>
  );
}

function ActiveSessionCard({
  net,
  session,
  myStationIds,
}: {
  net: NetDetailResponse;
  session: NetSessionResponse;
  myStationIds: Set<string>;
}) {
  const closeSession = useCloseSession(net.id);
  const recordCheckin = useRecordCheckin(net.id);
  const removeCheckin = useRemoveCheckin(net.id);

  const checkedIn = new Map(session.checkins.map((checkin) => [checkin.stationId, checkin]));

  return (
    <Card className="border-navy-200 bg-navy-50/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Session in progress</CardTitle>
          <p className="mt-0.5 text-xs text-ink/60">
            Started {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ·{' '}
            {session.checkins.length} check-in{session.checkins.length === 1 ? '' : 's'}
          </p>
        </div>
        {net.viewerCanRunSession ? (
          <Button
            variant="secondary"
            onClick={() => void closeSession.mutateAsync({ sessionId: session.id })}
            disabled={closeSession.isPending}
          >
            Close session
          </Button>
        ) : null}
      </div>
      {closeSession.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {(closeSession.error as Error).message}
        </p>
      ) : null}
      {recordCheckin.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {(recordCheckin.error as Error).message}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-black/5">
        {net.participation.map((row) => {
          const checkin = checkedIn.get(row.stationId);
          const isMine = myStationIds.has(row.stationId);
          const canToggle = net.viewerCanRunSession || isMine;
          return (
            <li key={row.stationId} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink">{row.stationName}</p>
                <p className="text-xs text-ink/50">{row.operatorName}</p>
              </div>
              {checkin ? (
                <div className="flex items-center gap-2">
                  <Badge tone="primary">
                    Checked in{' '}
                    {new Date(checkin.checkedInAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Badge>
                  {canToggle ? (
                    <button
                      type="button"
                      className="text-xs text-ink/50 hover:text-red-700"
                      onClick={() =>
                        void removeCheckin.mutateAsync({ sessionId: session.id, stationId: row.stationId })
                      }
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ) : canToggle ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void recordCheckin.mutateAsync({ sessionId: session.id, stationId: row.stationId })
                  }
                  disabled={recordCheckin.isPending}
                >
                  {isMine && !net.viewerCanRunSession ? 'Check in my station' : 'Check in'}
                </Button>
              ) : (
                <span className="text-xs text-ink/40">Not checked in</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ParticipationCard({ net }: { net: NetDetailResponse }) {
  if (net.closedSessionCount === 0) {
    return (
      <Card>
        <CardTitle>Participation</CardTitle>
        <p className="mt-2 text-sm text-ink/60">
          No completed sessions yet. Stats appear after the first session is closed.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Participation</CardTitle>
      <p className="mt-0.5 text-xs text-ink/50">
        Across {net.closedSessionCount} completed session{net.closedSessionCount === 1 ? '' : 's'}.
      </p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs font-medium uppercase tracking-wide text-ink/50">
            <th className="py-1.5 pr-2">Station</th>
            <th className="py-1.5 pr-2 text-right">Attended</th>
            <th className="py-1.5 pr-2 text-right">Recent rate</th>
            <th className="py-1.5 text-right">Streak</th>
          </tr>
        </thead>
        <tbody>
          {net.participation.map((row) => (
            <tr key={row.stationId} className="border-b border-black/5">
              <td className="py-2 pr-2">
                <p className="font-medium text-ink">{row.stationName}</p>
                <p className="text-xs text-ink/50">{row.operatorName}</p>
              </td>
              <td className="py-2 pr-2 text-right text-ink/80">{row.sessionsAttended}</td>
              <td className="py-2 pr-2 text-right text-ink/80">{Math.round(row.recentAttendanceRate * 100)}%</td>
              <td className="py-2 text-right text-ink/80">
                {row.currentStreak > 0 ? `${row.currentStreak} in a row` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SessionHistoryCard({ net }: { net: NetDetailResponse }) {
  const pastSessions = net.sessions.filter((session) => session.status !== 'open');
  if (pastSessions.length === 0) return null;

  return (
    <Card>
      <CardTitle>Session history</CardTitle>
      <ul className="mt-3 divide-y divide-black/5">
        {pastSessions.map((session) => (
          <li key={session.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink/80">
                {new Date(session.startedAt).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {session.netControlStationName ? ` · Net control: ${session.netControlStationName}` : ''}
              </p>
              <Badge tone={session.status === 'closed' ? 'neutral' : 'amber'}>
                {session.status === 'closed'
                  ? `${session.checkins.length} check-in${session.checkins.length === 1 ? '' : 's'}`
                  : 'Cancelled'}
              </Badge>
            </div>
            {session.checkins.length > 0 ? (
              <p className="mt-1 text-xs text-ink/50">
                {session.checkins.map((checkin) => checkin.stationName).join(', ')}
              </p>
            ) : null}
            {session.notes ? <p className="mt-1 text-xs text-ink/60">{session.notes}</p> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
