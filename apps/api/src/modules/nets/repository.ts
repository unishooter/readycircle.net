import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  circleMemberships,
  circles,
  netCheckins,
  nets,
  netSessions,
  stations,
  users,
  type Database,
} from '@readycircle/database';
import type { CreateNetInput, UpdateNetInput } from '@readycircle/contracts';

export type NetRow = typeof nets.$inferSelect;
export type NetSessionRow = typeof netSessions.$inferSelect;
export type NetCheckinRow = typeof netCheckins.$inferSelect;

export async function createNetRecord(
  db: Database,
  circleId: string,
  creatorUserId: string,
  input: CreateNetInput,
): Promise<NetRow> {
  const [net] = await db
    .insert(nets)
    .values({
      circleId,
      name: input.name,
      description: input.description ?? null,
      channel: input.channel,
      frequency: input.schedule.frequency,
      firstOccursOn: input.schedule.firstOccursOn,
      timeLocal: input.schedule.timeLocal,
      timezone: input.schedule.timezone,
      durationMinutes: input.schedule.durationMinutes,
      procedure: input.procedure,
      sourcePlanVersionId: input.sourcePlanVersionId ?? null,
      createdBy: creatorUserId,
    })
    .returning();
  if (!net) throw new Error('Failed to create net.');
  return net;
}

export async function getNetById(db: Database, netId: string): Promise<NetRow | null> {
  const [row] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
  return row ?? null;
}

export async function listNetsForCircle(db: Database, circleId: string): Promise<NetRow[]> {
  return db
    .select()
    .from(nets)
    .where(and(eq(nets.circleId, circleId), eq(nets.status, 'active')))
    .orderBy(nets.createdAt);
}

export interface NetWithCircleName {
  net: NetRow;
  circleName: string;
}

/** Active nets across every Circle the user is an active member of. */
export async function listNetsForUser(db: Database, userId: string): Promise<NetWithCircleName[]> {
  const rows = await db
    .selectDistinct({ net: nets, circleName: circles.name })
    .from(nets)
    .innerJoin(circles, eq(circles.id, nets.circleId))
    .innerJoin(
      circleMemberships,
      and(
        eq(circleMemberships.circleId, nets.circleId),
        eq(circleMemberships.userId, userId),
        eq(circleMemberships.status, 'active'),
      ),
    )
    .where(eq(nets.status, 'active'))
    .orderBy(nets.createdAt);
  return rows;
}

export async function updateNetRecord(
  db: Database,
  netId: string,
  input: UpdateNetInput & { status?: 'active' | 'archived' },
): Promise<NetRow | null> {
  const fields: Partial<typeof nets.$inferInsert> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.description !== undefined) fields.description = input.description;
  if (input.channel !== undefined) fields.channel = input.channel;
  if (input.procedure !== undefined) fields.procedure = input.procedure;
  if (input.status !== undefined) fields.status = input.status;
  if (input.schedule !== undefined) {
    fields.frequency = input.schedule.frequency;
    fields.firstOccursOn = input.schedule.firstOccursOn;
    fields.timeLocal = input.schedule.timeLocal;
    fields.timezone = input.schedule.timezone;
    fields.durationMinutes = input.schedule.durationMinutes;
  }
  if (Object.keys(fields).length > 0) {
    fields.updatedAt = new Date();
    await db.update(nets).set(fields).where(eq(nets.id, netId));
  }
  return getNetById(db, netId);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSessionRecord(
  db: Database,
  input: {
    netId: string;
    scheduledFor: Date;
    netControlStationId: string | null;
    notes: string | null;
    createdBy: string;
  },
): Promise<NetSessionRow> {
  const [session] = await db
    .insert(netSessions)
    .values({
      netId: input.netId,
      scheduledFor: input.scheduledFor,
      netControlStationId: input.netControlStationId,
      notes: input.notes,
      createdBy: input.createdBy,
    })
    .returning();
  if (!session) throw new Error('Failed to create session.');
  return session;
}

export async function getSessionById(db: Database, sessionId: string): Promise<NetSessionRow | null> {
  const [row] = await db.select().from(netSessions).where(eq(netSessions.id, sessionId)).limit(1);
  return row ?? null;
}

export async function getOpenSessionForNet(db: Database, netId: string): Promise<NetSessionRow | null> {
  const [row] = await db
    .select()
    .from(netSessions)
    .where(and(eq(netSessions.netId, netId), eq(netSessions.status, 'open')))
    .limit(1);
  return row ?? null;
}

export async function closeSessionRecord(
  db: Database,
  sessionId: string,
  notes: string | null | undefined,
): Promise<NetSessionRow | null> {
  const fields: Partial<typeof netSessions.$inferInsert> = { status: 'closed', endedAt: new Date() };
  if (notes !== undefined) fields.notes = notes;
  const [row] = await db.update(netSessions).set(fields).where(eq(netSessions.id, sessionId)).returning();
  return row ?? null;
}

export async function listSessionsForNet(db: Database, netId: string, limit = 20): Promise<NetSessionRow[]> {
  return db
    .select()
    .from(netSessions)
    .where(eq(netSessions.netId, netId))
    .orderBy(desc(netSessions.startedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export interface CheckinWithStation {
  checkin: NetCheckinRow;
  stationName: string;
  operatorName: string;
}

export async function insertCheckinRecord(
  db: Database,
  input: { sessionId: string; stationId: string; recordedByUserId: string; note: string | null },
): Promise<NetCheckinRow> {
  const [row] = await db
    .insert(netCheckins)
    .values({
      sessionId: input.sessionId,
      stationId: input.stationId,
      recordedByUserId: input.recordedByUserId,
      note: input.note,
    })
    .returning();
  if (!row) throw new Error('Failed to record check-in.');
  return row;
}

export async function getCheckin(
  db: Database,
  sessionId: string,
  stationId: string,
): Promise<NetCheckinRow | null> {
  const [row] = await db
    .select()
    .from(netCheckins)
    .where(and(eq(netCheckins.sessionId, sessionId), eq(netCheckins.stationId, stationId)))
    .limit(1);
  return row ?? null;
}

export async function deleteCheckinRecord(db: Database, sessionId: string, stationId: string): Promise<void> {
  await db
    .delete(netCheckins)
    .where(and(eq(netCheckins.sessionId, sessionId), eq(netCheckins.stationId, stationId)));
}

/** Check-ins (with station/operator names) for a set of sessions. */
export async function listCheckinsForSessions(
  db: Database,
  sessionIds: string[],
): Promise<Map<string, CheckinWithStation[]>> {
  const result = new Map<string, CheckinWithStation[]>();
  if (sessionIds.length === 0) return result;
  const rows = await db
    .select({ checkin: netCheckins, stationName: stations.name, operatorName: users.displayName })
    .from(netCheckins)
    .innerJoin(stations, eq(stations.id, netCheckins.stationId))
    .innerJoin(users, eq(users.id, stations.ownerId))
    .where(inArray(netCheckins.sessionId, sessionIds))
    .orderBy(netCheckins.checkedInAt);
  for (const row of rows) {
    const list = result.get(row.checkin.sessionId) ?? [];
    list.push(row);
    result.set(row.checkin.sessionId, list);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Circle membership helpers (nets-specific views of the roster)
// ---------------------------------------------------------------------------

export interface MemberStation {
  stationId: string;
  stationName: string;
  operatorName: string;
  ownerId: string;
}

/** Active stations of active members of a Circle. */
export async function listActiveMemberStations(db: Database, circleId: string): Promise<MemberStation[]> {
  const rows = await db
    .select({
      stationId: stations.id,
      stationName: stations.name,
      operatorName: users.displayName,
      ownerId: stations.ownerId,
    })
    .from(circleMemberships)
    .innerJoin(
      stations,
      and(eq(stations.id, circleMemberships.stationId), eq(stations.status, 'active')),
    )
    .innerJoin(users, eq(users.id, circleMemberships.userId))
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')))
    .orderBy(circleMemberships.joinedAt);
  return rows;
}

/** Whether the user owns an active member station flagged willing-to-act-as-net-control. */
export async function userHasNetControlStation(
  db: Database,
  circleId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: stations.id })
    .from(circleMemberships)
    .innerJoin(
      stations,
      and(
        eq(stations.id, circleMemberships.stationId),
        eq(stations.status, 'active'),
        eq(stations.ownerId, userId),
        eq(stations.willingToActAsNetControl, true),
      ),
    )
    .where(
      and(
        eq(circleMemberships.circleId, circleId),
        eq(circleMemberships.userId, userId),
        eq(circleMemberships.status, 'active'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Station name lookup used when shaping net-control references. */
export async function getStationName(db: Database, stationId: string): Promise<string | null> {
  const [row] = await db.select({ name: stations.name }).from(stations).where(eq(stations.id, stationId)).limit(1);
  return row?.name ?? null;
}
