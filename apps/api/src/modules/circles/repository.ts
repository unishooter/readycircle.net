import { and, eq, inArray } from 'drizzle-orm';
import {
  circleMemberships,
  circleRoleAssignments,
  circleRoles,
  circles,
  type Database,
} from '@readycircle/database';
import { generateCircleIdentifier, isCircleIdentifierCollision } from '@readycircle/domain';
import type { CreateCircleInput, UpdateCircleInput } from '@readycircle/contracts';
import { ConflictError } from '../../lib/errors.js';

export type CircleRow = typeof circles.$inferSelect;

const MAX_CIRCLE_IDENTIFIER_ATTEMPTS = 10;
const CIRCLE_IDENTIFIER_EXHAUSTED_MESSAGE =
  'Could not assign a unique Circle Identifier. Please try creating the Circle again.';

/**
 * Generates the Circle Identifier and inserts the circle + creator
 * membership + coordinator role assignment inside one transaction. On an
 * identifier collision the whole transaction is retried from scratch with a
 * fresh identifier -- a failed statement poisons the current Postgres
 * transaction, so we can't catch-and-continue *within* it, only retry the
 * entire `db.transaction(...)` call with bounded attempts.
 */
export async function createCircleRecord(
  db: Database,
  creatorUserId: string,
  input: CreateCircleInput,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CIRCLE_IDENTIFIER_ATTEMPTS; attempt++) {
    const circleIdentifier = generateCircleIdentifier();
    try {
      return await db.transaction(async (tx) => {
        const [circle] = await tx
          .insert(circles)
          .values({
            circleIdentifier,
            circleType: input.circleType,
            name: input.name,
            shortDescription: input.shortDescription ?? null,
            purpose: input.purpose ?? null,
            areaLabel: input.area.areaLabel,
            gridOrLocalityLabel: input.area.gridOrLocalityLabel ?? null,
            isPrivate: input.isPrivate,
            requiresApproval: input.requiresApproval,
            memberSharingPolicy: input.memberSharingPolicy,
            createdBy: creatorUserId,
          })
          .returning();
        if (!circle) throw new Error('Failed to create circle.');

        const [membership] = await tx
          .insert(circleMemberships)
          .values({ circleId: circle.id, stationId: input.creatorStationId, userId: creatorUserId })
          .returning();
        if (!membership) throw new Error('Failed to create the creator membership.');

        const [coordinatorRole] = await tx
          .select()
          .from(circleRoles)
          .where(eq(circleRoles.key, 'coordinator'))
          .limit(1);
        if (!coordinatorRole) {
          throw new Error('Circle role catalog is missing the coordinator role. Run `pnpm db:migrate`.');
        }
        await tx
          .insert(circleRoleAssignments)
          .values({ membershipId: membership.id, roleId: coordinatorRole.id, assignedBy: creatorUserId });

        return circle.id;
      });
    } catch (error) {
      if (isCircleIdentifierCollision(error) && attempt < MAX_CIRCLE_IDENTIFIER_ATTEMPTS) continue;
      if (isCircleIdentifierCollision(error)) throw new ConflictError(CIRCLE_IDENTIFIER_EXHAUSTED_MESSAGE);
      throw error;
    }
  }
  throw new ConflictError(CIRCLE_IDENTIFIER_EXHAUSTED_MESSAGE);
}

export async function getCircleById(db: Database, circleId: string): Promise<CircleRow | null> {
  const [row] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
  return row ?? null;
}

export async function listCirclesForUser(db: Database, userId: string): Promise<CircleRow[]> {
  const rows = await db
    .selectDistinct({ circle: circles })
    .from(circles)
    .innerJoin(
      circleMemberships,
      and(
        eq(circleMemberships.circleId, circles.id),
        eq(circleMemberships.userId, userId),
        eq(circleMemberships.status, 'active'),
      ),
    )
    .orderBy(circles.createdAt);
  return rows.map((row) => row.circle);
}

export async function updateCircleRecord(
  db: Database,
  circleId: string,
  input: UpdateCircleInput,
): Promise<CircleRow | null> {
  const fields: Partial<typeof circles.$inferInsert> = {};
  if (input.circleType !== undefined) fields.circleType = input.circleType;
  if (input.name !== undefined) fields.name = input.name;
  if (input.shortDescription !== undefined) fields.shortDescription = input.shortDescription;
  if (input.purpose !== undefined) fields.purpose = input.purpose;
  if (input.area?.areaLabel !== undefined) fields.areaLabel = input.area.areaLabel;
  if (input.area?.gridOrLocalityLabel !== undefined) fields.gridOrLocalityLabel = input.area.gridOrLocalityLabel;
  if (input.isPrivate !== undefined) fields.isPrivate = input.isPrivate;
  if (input.requiresApproval !== undefined) fields.requiresApproval = input.requiresApproval;
  if (input.memberSharingPolicy !== undefined) fields.memberSharingPolicy = input.memberSharingPolicy;
  if (input.status !== undefined) fields.status = input.status;

  if (Object.keys(fields).length > 0) {
    fields.updatedAt = new Date();
    await db.update(circles).set(fields).where(eq(circles.id, circleId));
  }
  return getCircleById(db, circleId);
}

export interface CircleCounts {
  memberCount: number;
  coordinatorCount: number;
}

export async function getCircleCounts(db: Database, circleId: string): Promise<CircleCounts> {
  const memberRows = await db
    .select({ id: circleMemberships.id })
    .from(circleMemberships)
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')));

  if (memberRows.length === 0) return { memberCount: 0, coordinatorCount: 0 };

  const membershipIds = memberRows.map((row) => row.id);
  const coordinatorRows = await db
    .select({ id: circleRoleAssignments.id })
    .from(circleRoleAssignments)
    .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
    .where(and(inArray(circleRoleAssignments.membershipId, membershipIds), eq(circleRoles.key, 'coordinator')));

  return { memberCount: memberRows.length, coordinatorCount: coordinatorRows.length };
}

export async function getViewerRole(
  db: Database,
  circleId: string,
  userId: string,
): Promise<'coordinator' | 'member' | null> {
  const [membership] = await db
    .select()
    .from(circleMemberships)
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.userId, userId), eq(circleMemberships.status, 'active')))
    .limit(1);
  if (!membership) return null;

  const [assignment] = await db
    .select({ key: circleRoles.key })
    .from(circleRoleAssignments)
    .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
    .where(eq(circleRoleAssignments.membershipId, membership.id))
    .limit(1);

  return (assignment?.key as 'coordinator' | 'member' | undefined) ?? 'member';
}
