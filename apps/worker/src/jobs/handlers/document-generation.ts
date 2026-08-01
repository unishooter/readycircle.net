import { z } from 'zod';
import type { Database } from '@readycircle/database';
import { generatePlanDocument, type DocumentStore } from '@readycircle/plan-engine';
import type { JobHandler } from '../types.js';

export const DOCUMENT_GENERATION_JOB_TYPE = 'document.generate';

export const documentGenerationPayloadSchema = z.object({
  planVersionId: z.string().uuid(),
  format: z.enum(['pdf', 'html']).default('pdf'),
});
export type DocumentGenerationPayload = z.infer<typeof documentGenerationPayloadSchema>;

export interface DocumentGenerationHandlerDeps {
  db: Database;
  documentStore: DocumentStore;
}

/**
 * Renders a published plan version to a PDF and stores it (S3 in
 * production, local disk in development). Progress is tracked in the
 * `plan_documents` table; failures are recorded there rather than thrown.
 */
export function createDocumentGenerationHandler(deps: DocumentGenerationHandlerDeps): JobHandler {
  return async (rawPayload, { logger }) => {
    const payload = documentGenerationPayloadSchema.parse(rawPayload);
    logger.info(
      { jobType: DOCUMENT_GENERATION_JOB_TYPE, planVersionId: payload.planVersionId, format: payload.format },
      'processing document-generation job',
    );
    await generatePlanDocument({
      db: deps.db,
      planVersionId: payload.planVersionId,
      format: payload.format,
      store: deps.documentStore,
      logger,
    });
  };
}
