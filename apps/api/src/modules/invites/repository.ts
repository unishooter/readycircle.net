import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { circleInvitations, circles, users, type Database } from '@readycircle/database';

export type CircleInviteRowStatus = 'pending' | 'accepted' | 'revoked';

export interface CircleInviteRow {
  id: string;
  circleId: string;
  circleName: string;
  note: string | null;
  invitedByUserId: string;
  invitedByDisplayName: string;
  status: CircleInviteRowStatus;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  acceptedByDisplayName: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
}

function selectInviteQuery(db: Database) {
  const invitedByUser = alias(users, 'invited_by_user');
  const acceptedByUser = alias(users, 'accepted_by_user');
  return db
    .select({
      invite: circleInvitations,
      circleName: circles.name,
      invitedByDisplayName: invitedByUser.displayName,
      acceptedByDisplayName: acceptedByUser.displayName,
    })
    .from(circleInvitations)
    .innerJoin(circles, eq(circles.id, circleInvitations.circleId))
    .innerJoin(invitedByUser, eq(invitedByUser.id, circleInvitations.invitedBy))
    .leftJoin(acceptedByUser, eq(acceptedByUser.id, circleInvitations.acceptedByUserId));
}

function toRow(row: {
  invite: typeof circleInvitations.$inferSelect;
  circleName: string;
  invitedByDisplayName: string;
  acceptedByDisplayName: string | null;
}): CircleInviteRow {
  return {
    id: row.invite.id,
    circleId: row.invite.circleId,
    circleName: row.circleName,
    note: row.invite.invitedEmail,
    invitedByUserId: row.invite.invitedBy,
    invitedByDisplayName: row.invitedByDisplayName,
    status: row.invite.status as CircleInviteRowStatus,
    tokenHash: row.invite.tokenHash,
    createdAt: row.invite.createdAt,
    expiresAt: row.invite.expiresAt,
    acceptedAt: row.invite.acceptedAt,
    acceptedByUserId: row.invite.acceptedByUserId,
    acceptedByDisplayName: row.acceptedByDisplayName,
    revokedAt: row.invite.revokedAt,
    revokedByUserId: row.invite.revokedByUserId,
  };
}

export async function createCircleInvite(
  db: Database,
  circleId: string,
  invitedByUserId: string,
  tokenHash: string,
  expiresAt: Date,
  note: string | null,
): Promise<string> {
  const [row] = await db
    .insert(circleInvitations)
    .values({
      circleId,
      invitedBy: invitedByUserId,
      tokenHash,
      expiresAt,
      invitedEmail: note,
    })
    .returning();
  if (!row) throw new Error('Failed to create circle invite.');
  return row.id;
}

export async function getCircleInviteById(db: Database, inviteId: string): Promise<CircleInviteRow | null> {
  const [row] = await selectInviteQuery(db).where(eq(circleInvitations.id, inviteId)).limit(1);
  return row ? toRow(row) : null;
}

export async function getCircleInviteByTokenHash(db: Database, tokenHash: string): Promise<CircleInviteRow | null> {
  const [row] = await selectInviteQuery(db).where(eq(circleInvitations.tokenHash, tokenHash)).limit(1);
  return row ? toRow(row) : null;
}

export async function listCircleInvites(db: Database, circleId: string): Promise<CircleInviteRow[]> {
  const rows = await selectInviteQuery(db)
    .where(eq(circleInvitations.circleId, circleId))
    .orderBy(circleInvitations.createdAt);
  return rows.map(toRow);
}

export async function markCircleInviteAccepted(db: Database, inviteId: string, userId: string): Promise<void> {
  await db
    .update(circleInvitations)
    .set({ status: 'accepted', acceptedAt: new Date(), acceptedByUserId: userId })
    .where(and(eq(circleInvitations.id, inviteId), eq(circleInvitations.status, 'pending')));
}

export async function markCircleInviteRevoked(db: Database, inviteId: string, userId: string): Promise<void> {
  await db
    .update(circleInvitations)
    .set({ status: 'revoked', revokedAt: new Date(), revokedByUserId: userId })
    .where(and(eq(circleInvitations.id, inviteId), eq(circleInvitations.status, 'pending')));
}
