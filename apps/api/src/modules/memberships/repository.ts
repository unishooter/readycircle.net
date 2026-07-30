import { and, eq, inArray } from 'drizzle-orm';
import {
  circleMemberships,
  circleRoleAssignments,
  circleRoles,
  stations,
  type Database,
} from '@readycircle/database';

export interface MembershipDetail {
  id: string;
  circleId: string;
  stationId: string;
  stationName: string;
  userId: string;
  status: 'active' | 'removed';
  joinedAt: Date;
  role: 'coordinator' | 'member';
}

function roleMapFromRows(rows: { membershipId: string; key: string }[]): Map<string, 'coordinator' | 'member'> {
  return new Map(rows.map((row) => [row.membershipId, row.key as 'coordinator' | 'member']));
}

export async function listMembers(db: Database, circleId: string): Promise<MembershipDetail[]> {
  const rows = await db
    .select({ membership: circleMemberships, stationName: stations.name })
    .from(circleMemberships)
    .innerJoin(stations, eq(stations.id, circleMemberships.stationId))
    .where(eq(circleMemberships.circleId, circleId))
    .orderBy(circleMemberships.joinedAt);

  if (rows.length === 0) return [];

  const membershipIds = rows.map((row) => row.membership.id);
  const roleRows = await db
    .select({ membershipId: circleRoleAssignments.membershipId, key: circleRoles.key })
    .from(circleRoleAssignments)
    .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
    .where(inArray(circleRoleAssignments.membershipId, membershipIds));
  const roleByMembership = roleMapFromRows(roleRows);

  return rows.map((row) => ({
    id: row.membership.id,
    circleId: row.membership.circleId,
    stationId: row.membership.stationId,
    stationName: row.stationName,
    userId: row.membership.userId,
    status: row.membership.status as 'active' | 'removed',
    joinedAt: row.membership.joinedAt,
    role: roleByMembership.get(row.membership.id) ?? 'member',
  }));
}

export async function getMembershipById(db: Database, membershipId: string): Promise<MembershipDetail | null> {
  const [row] = await db
    .select({ membership: circleMemberships, stationName: stations.name })
    .from(circleMemberships)
    .innerJoin(stations, eq(stations.id, circleMemberships.stationId))
    .where(eq(circleMemberships.id, membershipId))
    .limit(1);
  if (!row) return null;

  const [assignment] = await db
    .select({ key: circleRoles.key })
    .from(circleRoleAssignments)
    .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
    .where(eq(circleRoleAssignments.membershipId, membershipId))
    .limit(1);

  return {
    id: row.membership.id,
    circleId: row.membership.circleId,
    stationId: row.membership.stationId,
    stationName: row.stationName,
    userId: row.membership.userId,
    status: row.membership.status as 'active' | 'removed',
    joinedAt: row.membership.joinedAt,
    role: (assignment?.key as 'coordinator' | 'member' | undefined) ?? 'member',
  };
}

export async function getStationOwner(db: Database, stationId: string): Promise<{ ownerId: string; name: string } | null> {
  const [row] = await db
    .select({ ownerId: stations.ownerId, name: stations.name })
    .from(stations)
    .where(eq(stations.id, stationId))
    .limit(1);
  return row ?? null;
}

export async function addMember(db: Database, circleId: string, stationId: string, userId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [membership] = await tx.insert(circleMemberships).values({ circleId, stationId, userId }).returning();
    if (!membership) throw new Error('Failed to add member.');

    const [memberRole] = await tx.select().from(circleRoles).where(eq(circleRoles.key, 'member')).limit(1);
    if (!memberRole) throw new Error('Circle role catalog is missing the member role. Run `pnpm db:migrate`.');

    await tx.insert(circleRoleAssignments).values({ membershipId: membership.id, roleId: memberRole.id });
    return membership.id;
  });
}

export async function countActiveCoordinators(
  db: Database,
  circleId: string,
  excludeMembershipId?: string,
): Promise<number> {
  const memberRows = await db
    .select({ id: circleMemberships.id })
    .from(circleMemberships)
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')));
  const ids = memberRows.map((row) => row.id).filter((id) => id !== excludeMembershipId);
  if (ids.length === 0) return 0;

  const coordinatorRows = await db
    .select({ id: circleRoleAssignments.id })
    .from(circleRoleAssignments)
    .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
    .where(and(inArray(circleRoleAssignments.membershipId, ids), eq(circleRoles.key, 'coordinator')));
  return coordinatorRows.length;
}

export async function setMembershipRole(
  db: Database,
  membershipId: string,
  roleKey: 'coordinator' | 'member',
  assignedBy: string,
): Promise<void> {
  const [role] = await db.select().from(circleRoles).where(eq(circleRoles.key, roleKey)).limit(1);
  if (!role) throw new Error(`Circle role catalog is missing the "${roleKey}" role. Run \`pnpm db:migrate\`.`);
  await db.delete(circleRoleAssignments).where(eq(circleRoleAssignments.membershipId, membershipId));
  await db.insert(circleRoleAssignments).values({ membershipId, roleId: role.id, assignedBy });
}

export async function setMembershipStatus(db: Database, membershipId: string, status: 'active' | 'removed'): Promise<void> {
  await db.update(circleMemberships).set({ status, updatedAt: new Date() }).where(eq(circleMemberships.id, membershipId));
}
