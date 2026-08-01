import { z } from 'zod';
import type { Database } from '@readycircle/database';
import { generatePlanVersion, type AdvisoryProvider } from '@readycircle/plan-engine';
import type { JobHandler } from '../types.js';

export const PLAN_GENERATION_JOB_TYPE = 'plan.generate';

export const planGenerationPayloadSchema = z.object({
  planVersionId: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
});
export type PlanGenerationPayload = z.infer<typeof planGenerationPayloadSchema>;

export interface PlanGenerationHandlerDeps {
  db: Database;
  advisoryProvider: AdvisoryProvider;
}

/**
 * Fills the (already-created) `generating` plan version with deterministic
 * and AI advisory content. All the real work lives in
 * @readycircle/plan-engine so the API's in-process development fallback
 * runs exactly the same code. Failures are recorded on the version rather
 * than thrown, so the message is consumed either way -- users retry via
 * the explicit regenerate action, not queue redelivery.
 */
export function createPlanGenerationHandler(deps: PlanGenerationHandlerDeps): JobHandler {
  return async (rawPayload, { logger }) => {
    const payload = planGenerationPayloadSchema.parse(rawPayload);
    logger.info(
      { jobType: PLAN_GENERATION_JOB_TYPE, planVersionId: payload.planVersionId },
      'processing plan-generation job',
    );
    await generatePlanVersion({
      db: deps.db,
      planVersionId: payload.planVersionId,
      advisoryProvider: deps.advisoryProvider,
      logger,
    });
  };
}
