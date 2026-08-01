import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  circleMemberships,
  circles,
  planDocuments,
  planSections,
  planVersions,
  plans,
  type Database,
} from '@readycircle/database';

export type PlanRow = typeof plans.$inferSelect;
export type PlanVersionRow = typeof planVersions.$inferSelect;
export type PlanDocumentRow = typeof planDocuments.$inferSelect;
export type PlanSectionRow = typeof planSections.$inferSelect;

export async function createPlanWithFirstVersion(
  db: Database,
  input: { circleId: string; title: string; createdBy: string },
): Promise<{ planId: string; versionId: string }> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({ circleId: input.circleId, title: input.title, status: 'active', createdBy: input.createdBy })
      .returning();
    if (!plan) throw new Error('Failed to create plan.');

    const [version] = await tx
      .insert(planVersions)
      .values({ planId: plan.id, versionNumber: 1, status: 'generating', createdBy: input.createdBy })
      .returning();
    if (!version) throw new Error('Failed to create the first plan version.');

    return { planId: plan.id, versionId: version.id };
  });
}

export async function addPlanVersion(
  db: Database,
  planId: string,
  createdBy: string,
): Promise<{ versionId: string; versionNumber: number }> {
  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ versionNumber: planVersions.versionNumber })
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1);
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    const [version] = await tx
      .insert(planVersions)
      .values({ planId, versionNumber, status: 'generating', createdBy })
      .returning();
    if (!version) throw new Error('Failed to create plan version.');

    await tx.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, planId));
    return { versionId: version.id, versionNumber };
  });
}

export async function getPlanById(db: Database, planId: string): Promise<PlanRow | null> {
  const [row] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return row ?? null;
}

export async function getVersionById(db: Database, versionId: string): Promise<PlanVersionRow | null> {
  const [row] = await db.select().from(planVersions).where(eq(planVersions.id, versionId)).limit(1);
  return row ?? null;
}

export async function listVersionsForPlan(db: Database, planId: string): Promise<PlanVersionRow[]> {
  return db
    .select()
    .from(planVersions)
    .where(eq(planVersions.planId, planId))
    .orderBy(desc(planVersions.versionNumber));
}

export async function listPlansForCircle(db: Database, circleId: string): Promise<PlanRow[]> {
  return db.select().from(plans).where(eq(plans.circleId, circleId)).orderBy(desc(plans.createdAt));
}

export interface PlanWithCircleName {
  plan: PlanRow;
  circleName: string;
}

/** All plans in Circles where the user has an active membership. */
export async function listPlansForUser(db: Database, userId: string): Promise<PlanWithCircleName[]> {
  const rows = await db
    .selectDistinct({ plan: plans, circleName: circles.name })
    .from(plans)
    .innerJoin(circles, eq(circles.id, plans.circleId))
    .innerJoin(
      circleMemberships,
      and(
        eq(circleMemberships.circleId, plans.circleId),
        eq(circleMemberships.userId, userId),
        eq(circleMemberships.status, 'active'),
      ),
    )
    .orderBy(desc(plans.createdAt));
  return rows;
}

export async function getSectionsForVersion(db: Database, versionId: string): Promise<PlanSectionRow[]> {
  return db
    .select()
    .from(planSections)
    .where(eq(planSections.planVersionId, versionId))
    .orderBy(planSections.sortOrder);
}

export async function publishVersion(db: Database, versionId: string): Promise<PlanVersionRow | null> {
  const [row] = await db
    .update(planVersions)
    .set({ status: 'published', publishedAt: new Date() })
    .where(eq(planVersions.id, versionId))
    .returning();
  return row ?? null;
}

export async function getDocumentsForVersions(
  db: Database,
  versionIds: string[],
): Promise<Map<string, PlanDocumentRow>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db.select().from(planDocuments).where(inArray(planDocuments.planVersionId, versionIds));
  return new Map(rows.map((row) => [row.planVersionId, row]));
}

export async function getDocumentForVersion(
  db: Database,
  versionId: string,
  format: string,
): Promise<PlanDocumentRow | null> {
  const [row] = await db
    .select()
    .from(planDocuments)
    .where(and(eq(planDocuments.planVersionId, versionId), eq(planDocuments.format, format)))
    .limit(1);
  return row ?? null;
}
