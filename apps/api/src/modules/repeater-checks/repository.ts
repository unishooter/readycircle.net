import { and, desc, eq } from 'drizzle-orm';
import { circles, repeaterChecks, repeaters, stations, users, type Database } from '@readycircle/database';

export interface RepeaterCheckRow {
  id: string;
  circleId: string;
  stationId: string;
  stationName: string;
  repeaterId: string;
  repeaterName: string;
  occurredAt: Date;
  access: string;
  counterpartyNote: string | null;
  signalRating: number | null;
  notes: string | null;
  recordedByUserId: string | null;
  recordedByDisplayName: string | null;
  createdAt: Date;
}

export interface InsertRepeaterCheckInput {
  circleId: string;
  stationId: string;
  repeaterId: string;
  occurredAt: Date;
  access: string;
  counterpartyNote: string | null;
  signalRating: number | null;
  notes: string | null;
  recordedByUserId: string;
}

function selectCheckQuery(db: Database) {
  return db
    .select({
      check: repeaterChecks,
      stationName: stations.name,
      repeaterName: repeaters.name,
      recordedByDisplayName: users.displayName,
    })
    .from(repeaterChecks)
    .innerJoin(circles, eq(circles.id, repeaterChecks.circleId))
    .innerJoin(stations, eq(stations.id, repeaterChecks.stationId))
    .innerJoin(repeaters, eq(repeaters.id, repeaterChecks.repeaterId))
    .leftJoin(users, eq(users.id, repeaterChecks.recordedByUserId));
}

function toRow(row: {
  check: typeof repeaterChecks.$inferSelect;
  stationName: string;
  repeaterName: string;
  recordedByDisplayName: string | null;
}): RepeaterCheckRow {
  return {
    id: row.check.id,
    circleId: row.check.circleId,
    stationId: row.check.stationId,
    stationName: row.stationName,
    repeaterId: row.check.repeaterId,
    repeaterName: row.repeaterName,
    occurredAt: row.check.occurredAt,
    access: row.check.access,
    counterpartyNote: row.check.counterpartyNote,
    signalRating: row.check.signalRating,
    notes: row.check.notes,
    recordedByUserId: row.check.recordedByUserId,
    recordedByDisplayName: row.recordedByDisplayName,
    createdAt: row.check.createdAt,
  };
}

export async function insertRepeaterCheck(db: Database, input: InsertRepeaterCheckInput): Promise<string> {
  const [row] = await db
    .insert(repeaterChecks)
    .values({
      circleId: input.circleId,
      stationId: input.stationId,
      repeaterId: input.repeaterId,
      occurredAt: input.occurredAt,
      access: input.access,
      counterpartyNote: input.counterpartyNote,
      signalRating: input.signalRating,
      notes: input.notes,
      recordedByUserId: input.recordedByUserId,
    })
    .returning();
  if (!row) throw new Error('Failed to log repeater check.');
  return row.id;
}

export async function getRepeaterCheckById(db: Database, checkId: string): Promise<RepeaterCheckRow | null> {
  const [row] = await selectCheckQuery(db).where(eq(repeaterChecks.id, checkId)).limit(1);
  return row ? toRow(row) : null;
}

export async function listRepeaterChecksByCircle(db: Database, circleId: string): Promise<RepeaterCheckRow[]> {
  const rows = await selectCheckQuery(db)
    .where(eq(repeaterChecks.circleId, circleId))
    .orderBy(desc(repeaterChecks.occurredAt));
  return rows.map(toRow);
}

export async function deleteRepeaterCheck(db: Database, checkId: string): Promise<void> {
  await db.delete(repeaterChecks).where(eq(repeaterChecks.id, checkId));
}

export async function getLatestCheckForStationRepeater(
  db: Database,
  stationId: string,
  repeaterId: string,
): Promise<RepeaterCheckRow | null> {
  const [row] = await selectCheckQuery(db)
    .where(and(eq(repeaterChecks.stationId, stationId), eq(repeaterChecks.repeaterId, repeaterId)))
    .orderBy(desc(repeaterChecks.occurredAt))
    .limit(1);
  return row ? toRow(row) : null;
}
