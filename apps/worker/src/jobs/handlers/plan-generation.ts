import { z } from 'zod';
import type { JobHandler } from '../types.js';

export const PLAN_GENERATION_JOB_TYPE = 'plan.generate';

export const planGenerationPayloadSchema = z.object({
  circleId: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
});
export type PlanGenerationPayload = z.infer<typeof planGenerationPayloadSchema>;

/**
 * Placeholder handler: validates the payload and logs receipt. Real plan
 * generation (content assembly, AI-assisted drafting, versioning) is out of
 * scope for this foundation milestone.
 */
export const handlePlanGeneration: JobHandler = async (rawPayload, { logger }) => {
  const payload = planGenerationPayloadSchema.parse(rawPayload);
  logger.info({ jobType: PLAN_GENERATION_JOB_TYPE, circleId: payload.circleId }, 'received plan-generation job (placeholder, no-op)');
  await Promise.resolve();
};
