import type { Database } from '@readycircle/database';
import { isValidTimeZone, nextOccurrences, type NetRecurrenceRule } from '@readycircle/domain';
import {
  NET_FREQUENCY_LABELS,
  type CloseNetSessionInput,
  type CreateNetInput,
  type NetDetailResponse,
  type NetFrequency,
  type NetParticipationStat,
  type NetResponse,
  type NetSessionResponse,
  type NetSessionStatus,
  type NetStatus,
  type OpenNetSessionInput,
  type RecordCheckinInput,
  type UpdateNetInput,
} from '@readycircle/contracts';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { getPlanById, getVersionById } from '../plans/repository.js';
import type { NetReminderService } from './reminders.js';
import {
  closeSessionRecord,
  createNetRecord,
  createSessionRecord,
  deleteCheckinRecord,
  getCheckin,
  getNetById,
  getOpenSessionForNet,
  getSessionById,
  getStationName,
  insertCheckinRecord,
  listActiveMemberStations,
  listCheckinsForSessions,
  listNetsForCircle,
  listNetsForUser,
  listSessionsForNet,
  updateNetRecord,
  userHasNetControlStation,
  type CheckinWithStation,
  type NetRow,
  type NetSessionRow,
} from './repository.js';

const UPCOMING_COUNT = 3;
const RECENT_SESSION_WINDOW = 10;

export class NetService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly reminders: NetReminderService,
  ) {}

  // -------------------------------------------------------------------------
  // Net CRUD
  // -------------------------------------------------------------------------

  async createNet(
    circleId: string,
    userId: string,
    input: CreateNetInput,
    requestId: string,
  ): Promise<NetResponse> {
    const { circle, role } = await this.requireCircleAccess(circleId, userId);
    if (role !== 'coordinator') {
      throw new ForbiddenError('Only Circle coordinators may schedule nets.');
    }
    this.validateSchedule(input.schedule.timezone, input.schedule.firstOccursOn);

    if (input.sourcePlanVersionId) {
      const version = await getVersionById(this.db, input.sourcePlanVersionId);
      const plan = version ? await getPlanById(this.db, version.planId) : null;
      if (!plan || plan.circleId !== circleId) {
        throw new BadRequestError('sourcePlanVersionId does not reference a plan of this Circle.');
      }
    }

    const net = await createNetRecord(this.db, circleId, userId, input);
    await this.audit.record({
      actorUserId: userId,
      action: 'net.created',
      targetType: 'net',
      targetId: net.id,
      requestId,
      metadata: { circleId, frequency: input.schedule.frequency },
    });
    return this.shapeNet(net, circle.name, userId, role);
  }

  async listForCircle(circleId: string, userId: string): Promise<NetResponse[]> {
    const { circle, role } = await this.requireCircleAccess(circleId, userId);
    const rows = await listNetsForCircle(this.db, circleId);
    return Promise.all(rows.map((net) => this.shapeNet(net, circle.name, userId, role)));
  }

  async listForUser(userId: string): Promise<NetResponse[]> {
    const rows = await listNetsForUser(this.db, userId);
    return Promise.all(
      rows.map(async ({ net, circleName }) => {
        const role = await getViewerRole(this.db, net.circleId, userId);
        return this.shapeNet(net, circleName, userId, role);
      }),
    );
  }

  async getNet(netId: string, userId: string): Promise<NetDetailResponse> {
    const net = await this.requireNet(netId);
    const { circle, role } = await this.requireCircleAccess(net.circleId, userId);

    const sessions = await listSessionsForNet(this.db, netId);
    const checkinsBySession = await listCheckinsForSessions(
      this.db,
      sessions.map((s) => s.id),
    );

    const base = await this.shapeNet(net, circle.name, userId, role);
    const shapedSessions = await Promise.all(
      sessions.map((session) => this.shapeSession(session, checkinsBySession.get(session.id) ?? [])),
    );

    const { participation, closedSessionCount } = await this.computeParticipation(net);

    return { ...base, sessions: shapedSessions, participation, closedSessionCount };
  }

  async updateNet(netId: string, userId: string, input: UpdateNetInput, requestId: string): Promise<NetResponse> {
    const net = await this.requireNet(netId);
    const { circle, role } = await this.requireCircleAccess(net.circleId, userId);
    if (role !== 'coordinator') {
      throw new ForbiddenError('Only Circle coordinators may edit nets.');
    }
    if (input.schedule) {
      this.validateSchedule(input.schedule.timezone, input.schedule.firstOccursOn);
    }
    const updated = await updateNetRecord(this.db, netId, input);
    if (!updated) throw new NotFoundError('Net not found.');
    await this.audit.record({
      actorUserId: userId,
      action: 'net.updated',
      targetType: 'net',
      targetId: netId,
      requestId,
      metadata: { fields: Object.keys(input) },
    });
    return this.shapeNet(updated, circle.name, userId, role);
  }

  async archiveNet(netId: string, userId: string, requestId: string): Promise<NetResponse> {
    const net = await this.requireNet(netId);
    const { circle, role } = await this.requireCircleAccess(net.circleId, userId);
    if (role !== 'coordinator') {
      throw new ForbiddenError('Only Circle coordinators may archive nets.');
    }
    const updated = await updateNetRecord(this.db, netId, { status: 'archived' });
    if (!updated) throw new NotFoundError('Net not found.');
    await this.audit.record({
      actorUserId: userId,
      action: 'net.archived',
      targetType: 'net',
      targetId: netId,
      requestId,
    });
    return this.shapeNet(updated, circle.name, userId, role);
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  async openSession(
    netId: string,
    userId: string,
    input: OpenNetSessionInput,
    requestId: string,
  ): Promise<NetSessionResponse> {
    const net = await this.requireNet(netId);
    if (net.status !== 'active') throw new ConflictError('This net is archived.');
    await this.requireCanRunSession(net.circleId, userId);

    const existing = await getOpenSessionForNet(this.db, netId);
    if (existing) throw new ConflictError('A session for this net is already open.');

    if (input.netControlStationId) {
      await this.requireMemberStation(net.circleId, input.netControlStationId);
    }

    const session = await createSessionRecord(this.db, {
      netId,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : new Date(),
      netControlStationId: input.netControlStationId ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'net.session_opened',
      targetType: 'net',
      targetId: netId,
      requestId,
      metadata: { sessionId: session.id },
    });
    await this.reminders.sessionOpened({
      netId,
      netName: net.name,
      circleId: net.circleId,
      sessionId: session.id,
    });
    return this.shapeSession(session, []);
  }

  async closeSession(
    netId: string,
    sessionId: string,
    userId: string,
    input: CloseNetSessionInput,
    requestId: string,
  ): Promise<NetSessionResponse> {
    const net = await this.requireNet(netId);
    await this.requireCanRunSession(net.circleId, userId);
    const session = await this.requireSession(sessionId, netId);
    if (session.status !== 'open') throw new ConflictError('This session is not open.');

    const closed = await closeSessionRecord(this.db, sessionId, input.notes);
    if (!closed) throw new NotFoundError('Session not found.');
    await this.audit.record({
      actorUserId: userId,
      action: 'net.session_closed',
      targetType: 'net',
      targetId: netId,
      requestId,
      metadata: { sessionId },
    });
    const checkins = await listCheckinsForSessions(this.db, [sessionId]);
    return this.shapeSession(closed, checkins.get(sessionId) ?? []);
  }

  // -------------------------------------------------------------------------
  // Check-ins
  // -------------------------------------------------------------------------

  async recordCheckin(
    netId: string,
    sessionId: string,
    userId: string,
    input: RecordCheckinInput,
    requestId: string,
  ): Promise<NetSessionResponse> {
    const net = await this.requireNet(netId);
    const session = await this.requireSession(sessionId, netId);
    if (session.status !== 'open') throw new ConflictError('Check-ins can only be recorded while a session is open.');

    const station = await this.requireMemberStation(net.circleId, input.stationId);
    const canRun = await this.canRunSession(net.circleId, userId);
    if (!canRun && station.ownerId !== userId) {
      throw new ForbiddenError('You may only check in your own station.');
    }

    const existing = await getCheckin(this.db, sessionId, input.stationId);
    if (existing) throw new ConflictError('This station has already checked in for this session.');

    await insertCheckinRecord(this.db, {
      sessionId,
      stationId: input.stationId,
      recordedByUserId: userId,
      note: input.note ?? null,
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'net.checkin_recorded',
      targetType: 'net',
      targetId: netId,
      requestId,
      metadata: { sessionId, stationId: input.stationId },
    });
    const checkins = await listCheckinsForSessions(this.db, [sessionId]);
    return this.shapeSession(session, checkins.get(sessionId) ?? []);
  }

  async removeCheckin(
    netId: string,
    sessionId: string,
    stationId: string,
    userId: string,
  ): Promise<NetSessionResponse> {
    const net = await this.requireNet(netId);
    const session = await this.requireSession(sessionId, netId);
    if (session.status !== 'open') throw new ConflictError('Check-ins can only be changed while a session is open.');

    const station = await this.requireMemberStation(net.circleId, stationId);
    const canRun = await this.canRunSession(net.circleId, userId);
    if (!canRun && station.ownerId !== userId) {
      throw new ForbiddenError('You may only remove your own check-in.');
    }

    await deleteCheckinRecord(this.db, sessionId, stationId);
    const checkins = await listCheckinsForSessions(this.db, [sessionId]);
    return this.shapeSession(session, checkins.get(sessionId) ?? []);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private validateSchedule(timezone: string, firstOccursOn: string): void {
    if (!isValidTimeZone(timezone)) {
      throw new BadRequestError(`Unknown timezone: ${timezone}`);
    }
    if (Number.isNaN(Date.parse(firstOccursOn))) {
      throw new BadRequestError(`Invalid first occurrence date: ${firstOccursOn}`);
    }
  }

  private async requireNet(netId: string): Promise<NetRow> {
    const net = await getNetById(this.db, netId);
    if (!net) throw new NotFoundError('Net not found.');
    return net;
  }

  private async requireSession(sessionId: string, netId: string): Promise<NetSessionRow> {
    const session = await getSessionById(this.db, sessionId);
    if (!session || session.netId !== netId) throw new NotFoundError('Session not found.');
    return session;
  }

  private async requireCircleAccess(circleId: string, userId: string) {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, userId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    return { circle, role };
  }

  private async canRunSession(circleId: string, userId: string): Promise<boolean> {
    const role = await getViewerRole(this.db, circleId, userId);
    if (role === 'coordinator') return true;
    if (!role) return false;
    return userHasNetControlStation(this.db, circleId, userId);
  }

  private async requireCanRunSession(circleId: string, userId: string): Promise<void> {
    const role = await getViewerRole(this.db, circleId, userId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    if (role === 'coordinator') return;
    if (await userHasNetControlStation(this.db, circleId, userId)) return;
    throw new ForbiddenError(
      'Only Circle coordinators or members with a net-control-willing station may run sessions.',
    );
  }

  private async requireMemberStation(circleId: string, stationId: string) {
    const members = await listActiveMemberStations(this.db, circleId);
    const station = members.find((member) => member.stationId === stationId);
    if (!station) throw new BadRequestError('That station is not an active member of this Circle.');
    return station;
  }

  private async shapeNet(
    net: NetRow,
    circleName: string,
    userId: string,
    role: 'coordinator' | 'member' | null,
  ): Promise<NetResponse> {
    const rule: NetRecurrenceRule = {
      frequency: net.frequency as NetFrequency,
      firstOccursOn: net.firstOccursOn,
      timeLocal: net.timeLocal,
      timezone: net.timezone,
    };
    const upcoming =
      net.status === 'active' ? nextOccurrences(rule, new Date(), UPCOMING_COUNT).map((d) => d.toISOString()) : [];
    const canRun =
      role === 'coordinator' ? true : role ? await userHasNetControlStation(this.db, net.circleId, userId) : false;

    return {
      id: net.id,
      circleId: net.circleId,
      circleName,
      name: net.name,
      description: net.description,
      channel: net.channel,
      schedule: {
        frequency: net.frequency as NetFrequency,
        frequencyLabel: NET_FREQUENCY_LABELS[net.frequency as NetFrequency] ?? net.frequency,
        firstOccursOn: net.firstOccursOn,
        timeLocal: net.timeLocal,
        timezone: net.timezone,
        durationMinutes: net.durationMinutes,
      },
      procedure: Array.isArray(net.procedure) ? (net.procedure as string[]) : [],
      status: net.status as NetStatus,
      sourcePlanVersionId: net.sourcePlanVersionId,
      nextOccurrences: upcoming,
      viewerCanManage: role === 'coordinator',
      viewerCanRunSession: canRun,
      createdAt: net.createdAt.toISOString(),
      updatedAt: net.updatedAt.toISOString(),
    };
  }

  private async shapeSession(session: NetSessionRow, checkins: CheckinWithStation[]): Promise<NetSessionResponse> {
    const netControlStationName = session.netControlStationId
      ? await getStationName(this.db, session.netControlStationId)
      : null;
    return {
      id: session.id,
      netId: session.netId,
      scheduledFor: session.scheduledFor.toISOString(),
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      status: session.status as NetSessionStatus,
      netControlStationId: session.netControlStationId,
      netControlStationName,
      notes: session.notes,
      checkins: checkins.map(({ checkin, stationName, operatorName }) => ({
        id: checkin.id,
        stationId: checkin.stationId,
        stationName,
        operatorName,
        checkedInAt: checkin.checkedInAt.toISOString(),
        note: checkin.note,
      })),
    };
  }

  /**
   * Participation stats over closed sessions: all-time attendance count,
   * attendance rate over the last N closed sessions, and the streak of
   * consecutive most-recent closed sessions attended. Rows cover every
   * active member station plus any station with recorded check-ins.
   */
  private async computeParticipation(
    net: NetRow,
  ): Promise<{ participation: NetParticipationStat[]; closedSessionCount: number }> {
    const allSessions = await listSessionsForNet(this.db, net.id, 1000);
    const closedSessions = allSessions
      .filter((session) => session.status === 'closed')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const checkinsBySession = await listCheckinsForSessions(
      this.db,
      closedSessions.map((session) => session.id),
    );

    const attendedBy = new Map<string, { name: string; operator: string; sessions: Set<string> }>();
    for (const [sessionId, checkins] of checkinsBySession) {
      for (const { checkin, stationName, operatorName } of checkins) {
        const entry = attendedBy.get(checkin.stationId) ?? {
          name: stationName,
          operator: operatorName,
          sessions: new Set<string>(),
        };
        entry.sessions.add(sessionId);
        attendedBy.set(checkin.stationId, entry);
      }
    }

    // Union of active member stations and stations with any history.
    const members = await listActiveMemberStations(this.db, net.circleId);
    const rows = new Map<string, { stationName: string; operatorName: string }>();
    for (const member of members) {
      rows.set(member.stationId, { stationName: member.stationName, operatorName: member.operatorName });
    }
    for (const [stationId, entry] of attendedBy) {
      if (!rows.has(stationId)) rows.set(stationId, { stationName: entry.name, operatorName: entry.operator });
    }

    const recentIds = closedSessions.slice(0, RECENT_SESSION_WINDOW).map((session) => session.id);

    const participation: NetParticipationStat[] = [...rows.entries()].map(([stationId, info]) => {
      const attended = attendedBy.get(stationId)?.sessions ?? new Set<string>();
      let streak = 0;
      for (const session of closedSessions) {
        if (attended.has(session.id)) streak += 1;
        else break;
      }
      const recentAttended = recentIds.filter((id) => attended.has(id)).length;
      return {
        stationId,
        stationName: info.stationName,
        operatorName: info.operatorName,
        sessionsAttended: attended.size,
        recentAttendanceRate: recentIds.length > 0 ? recentAttended / recentIds.length : 0,
        currentStreak: streak,
      };
    });

    participation.sort((a, b) => b.sessionsAttended - a.sessionsAttended || a.stationName.localeCompare(b.stationName));
    return { participation, closedSessionCount: closedSessions.length };
  }
}
