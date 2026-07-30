import { z } from 'zod';
import type { JobHandler } from '../types.js';

export const DOCUMENT_GENERATION_JOB_TYPE = 'document.generate';

export const documentGenerationPayloadSchema = z.object({
  planVersionId: z.string().uuid(),
  format: z.enum(['pdf', 'html']).default('pdf'),
});
export type DocumentGenerationPayload = z.infer<typeof documentGenerationPayloadSchema>;

/**
 * Placeholder handler: validates the payload and logs receipt. Real document
 * rendering (PDF/HTML generation and S3 upload) is out of scope for this
 * foundation milestone.
 */
export const handleDocumentGeneration: JobHandler = async (rawPayload, { logger }) => {
  const payload = documentGenerationPayloadSchema.parse(rawPayload);
  logger.info(
    { jobType: DOCUMENT_GENERATION_JOB_TYPE, planVersionId: payload.planVersionId, format: payload.format },
    'received document-generation job (placeholder, no-op)',
  );
  await Promise.resolve();
};
