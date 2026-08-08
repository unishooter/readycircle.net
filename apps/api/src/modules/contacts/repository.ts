import { desc, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { circles, contacts, repeaters, stationLocations, stations, users, type Database } from '@readycircle/database';

export interface ContactRow {
  id: string;
  circleId: string;
  circleName: string;
  stationId: string;
  stationName: string;
  counterpartyStationId: string;
  counterpartyStationName: string;
  occurredAt: Date;
  mode: string;
  repeaterId: string | null;
  repeaterName: string | null;
  channel: string | null;
  signalRating: number | null;
  notes: string | null;
  netSessionId: string | null;
  stationLatitude: number | null;
  stationLongitude: number | null;
  stationLocationOverridden: boolean;
  counterpartyLatitude: number | null;
  counterpartyLongitude: number | null;
  counterpartyLocationOverridden: boolean;
  recordedByUserId: string | null;
  recordedByDisplayName: string | null;
  createdAt: Date;
}

export interface InsertContactInput {
  circleId: string;
  stationId: string;
  counterpartyStationId: string;
  occurredAt: Date;
  mode: string;
  repeaterId: string | null;
  channel: string | null;
  signalRating: number | null;
  notes: string | null;
  netSessionId: string | null;
  stationLatitude: number | null;
  stationLongitude: number | null;
  stationLocationOverridden: boolean;
  counterpartyLatitude: number | null;
  counterpartyLongitude: number | null;
  counterpartyLocationOverridden: boolean;
  recordedByUserId: string;
}

const counterpartyStation = alias(stations, 'counterparty_station');

function selectContactQuery(db: Database) {
  return db
    .select({
      contact: contacts,
      circleName: circles.name,
      stationName: stations.name,
      counterpartyStationName: counterpartyStation.name,
      repeaterName: repeaters.name,
      recordedByDisplayName: users.displayName,
    })
    .from(contacts)
    .innerJoin(circles, eq(circles.id, contacts.circleId))
    .innerJoin(stations, eq(stations.id, contacts.stationId))
    .innerJoin(counterpartyStation, eq(counterpartyStation.id, contacts.counterpartyStationId))
    .leftJoin(repeaters, eq(repeaters.id, contacts.repeaterId))
    .leftJoin(users, eq(users.id, contacts.recordedByUserId));
}

function toRow(row: {
  contact: typeof contacts.$inferSelect;
  circleName: string;
  stationName: string;
  counterpartyStationName: string;
  repeaterName: string | null;
  recordedByDisplayName: string | null;
}): ContactRow {
  return {
    id: row.contact.id,
    circleId: row.contact.circleId,
    circleName: row.circleName,
    stationId: row.contact.stationId,
    stationName: row.stationName,
    counterpartyStationId: row.contact.counterpartyStationId,
    counterpartyStationName: row.counterpartyStationName,
    occurredAt: row.contact.occurredAt,
    mode: row.contact.mode,
    repeaterId: row.contact.repeaterId,
    repeaterName: row.repeaterName,
    channel: row.contact.channel,
    signalRating: row.contact.signalRating,
    notes: row.contact.notes,
    netSessionId: row.contact.netSessionId,
    stationLatitude: row.contact.stationLatitude,
    stationLongitude: row.contact.stationLongitude,
    stationLocationOverridden: row.contact.stationLocationOverridden,
    counterpartyLatitude: row.contact.counterpartyLatitude,
    counterpartyLongitude: row.contact.counterpartyLongitude,
    counterpartyLocationOverridden: row.contact.counterpartyLocationOverridden,
    recordedByUserId: row.contact.recordedByUserId,
    recordedByDisplayName: row.recordedByDisplayName,
    createdAt: row.contact.createdAt,
  };
}

export async function getStationCoords(
  db: Database,
  stationId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const [row] = await db
    .select({ latitude: stationLocations.latitude, longitude: stationLocations.longitude })
    .from(stationLocations)
    .where(eq(stationLocations.stationId, stationId))
    .limit(1);
  if (!row || row.latitude == null || row.longitude == null) return null;
  return { latitude: row.latitude, longitude: row.longitude };
}

export async function insertContact(db: Database, input: InsertContactInput): Promise<string> {
  const [row] = await db
    .insert(contacts)
    .values({
      circleId: input.circleId,
      stationId: input.stationId,
      counterpartyStationId: input.counterpartyStationId,
      occurredAt: input.occurredAt,
      mode: input.mode,
      repeaterId: input.repeaterId,
      channel: input.channel,
      signalRating: input.signalRating,
      notes: input.notes,
      netSessionId: input.netSessionId,
      stationLatitude: input.stationLatitude,
      stationLongitude: input.stationLongitude,
      stationLocationOverridden: input.stationLocationOverridden,
      counterpartyLatitude: input.counterpartyLatitude,
      counterpartyLongitude: input.counterpartyLongitude,
      counterpartyLocationOverridden: input.counterpartyLocationOverridden,
      recordedByUserId: input.recordedByUserId,
    })
    .returning();
  if (!row) throw new Error('Failed to log contact.');
  return row.id;
}

export async function getContactById(db: Database, contactId: string): Promise<ContactRow | null> {
  const [row] = await selectContactQuery(db).where(eq(contacts.id, contactId)).limit(1);
  return row ? toRow(row) : null;
}

export async function listContactsByCircle(db: Database, circleId: string): Promise<ContactRow[]> {
  const rows = await selectContactQuery(db).where(eq(contacts.circleId, circleId)).orderBy(desc(contacts.occurredAt));
  return rows.map(toRow);
}

/** Any contact where one of the given stations is either side of the pair. */
export async function listContactsByStationIds(db: Database, stationIds: string[]): Promise<ContactRow[]> {
  if (stationIds.length === 0) return [];
  const rows = await selectContactQuery(db)
    .where(or(inArray(contacts.stationId, stationIds), inArray(contacts.counterpartyStationId, stationIds)))
    .orderBy(desc(contacts.occurredAt));
  return rows.map(toRow);
}

export async function getStationIdsOwnedByUser(db: Database, ownerId: string): Promise<string[]> {
  const rows = await db.select({ id: stations.id }).from(stations).where(eq(stations.ownerId, ownerId));
  return rows.map((row) => row.id);
}

export async function deleteContact(db: Database, contactId: string): Promise<void> {
  await db.delete(contacts).where(eq(contacts.id, contactId));
}
