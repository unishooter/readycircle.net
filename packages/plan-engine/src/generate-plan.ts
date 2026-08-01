import { eq } from 'drizzle-orm';
import { planSections, planVersions, plans, type Database } from '@readycircle/database';
import {
  PLAN_SECTION_ORDER,
  PLAN_SECTION_TITLES,
  type PlanGenerationStage,
  type PlanSectionKey,
} from '@readycircle/contracts';
import { buildPlanContext } from './context.js';
import { buildOverviewContent, buildRosterContent } from './sections.js';
import { validateAdvisoryStationRefs, type AdvisoryProvider } from './advisory.js';
import type { EngineLogger } from './types.js';

export interface GeneratePlanVersionOptions {
  db: Database;
  planVersionId: string;
  advisoryProvider: AdvisoryProvider;
  logger: EngineLogger;
}

export type GeneratePlanVersionResult = { status: 'draft' } | { status: 'failed'; error: string } | { status: 'skipped'; reason: string };

/**
 * Fills a `generating` plan version with content: deterministic sections
 * from the Circle context plus AI advisory sections. Failures are recorded
 * on the version (`status = 'failed'`, `error_message`) rather than thrown,
 * so a queue redelivery never re-burns an AI call for a permanently bad
 * input -- the user retries explicitly via regenerate.
 */
export async function generatePlanVersion(options: GeneratePlanVersionOptions): Promise<GeneratePlanVersionResult> {
  const { db, planVersionId, advisoryProvider, logger } = options;

  const [version] = await db.select().from(planVersions).where(eq(planVersions.id, planVersionId)).limit(1);
  if (!version) {
    logger.warn({ planVersionId }, 'plan version not found; skipping generation');
    return { status: 'skipped', reason: 'version not found' };
  }
  if (version.status !== 'generating' && version.status !== 'failed') {
    logger.warn({ planVersionId, status: version.status }, 'plan version is not awaiting generation; skipping');
    return { status: 'skipped', reason: `version status is ${version.status}` };
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, version.planId)).limit(1);
  if (!plan) {
    logger.warn({ planVersionId, planId: version.planId }, 'parent plan not found; skipping generation');
    return { status: 'skipped', reason: 'plan not found' };
  }

  // Progress markers for the polling UI. Best-effort: stage writes are
  // cosmetic and must never fail a generation.
  const setStage = async (stage: PlanGenerationStage) => {
    await db.update(planVersions).set({ generationStage: stage }).where(eq(planVersions.id, planVersionId));
  };

  try {
    await setStage('assembling_context');
    const context = await buildPlanContext(db, plan.circleId);
    if (context.members.length === 0) {
      throw new Error('This Circle has no active member stations to plan for.');
    }

    const overview = buildOverviewContent(context);
    const roster = buildRosterContent(context);

    logger.info(
      { planVersionId, circleId: plan.circleId, memberCount: context.members.length },
      'requesting AI advisory sections',
    );
    await setStage('drafting_advisory');
    const rawAdvisory = await advisoryProvider.generateAdvisory(context);
    const advisory = validateAdvisoryStationRefs(rawAdvisory, context, logger);

    const sectionContents: Record<PlanSectionKey, unknown> = {
      overview,
      roster,
      channel_plan: advisory.channelPlan,
      role_assignments: advisory.roleAssignments,
      check_in_schedule: advisory.checkInSchedule,
      recommendations: advisory.recommendations,
    };

    await setStage('saving');
    await db.transaction(async (tx) => {
      // Idempotent on retry-after-failure: replace any partial content.
      await tx.delete(planSections).where(eq(planSections.planVersionId, planVersionId));
      await tx.insert(planSections).values(
        PLAN_SECTION_ORDER.map((sectionKey, index) => ({
          planVersionId,
          sectionKey,
          title: PLAN_SECTION_TITLES[sectionKey],
          content: sectionContents[sectionKey],
          sortOrder: index,
        })),
      );
      await tx
        .update(planVersions)
        .set({ status: 'draft', contextSnapshot: context, errorMessage: null, generationStage: null })
        .where(eq(planVersions.id, planVersionId));
    });

    logger.info({ planVersionId }, 'plan version generated');
    return { status: 'draft' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ planVersionId, err: error }, 'plan generation failed');
    await db
      .update(planVersions)
      .set({ status: 'failed', errorMessage: message.slice(0, 1000), generationStage: null })
      .where(eq(planVersions.id, planVersionId));
    return { status: 'failed', error: message };
  }
}
