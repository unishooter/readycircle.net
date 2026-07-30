import { z } from 'zod';
import type { Logger } from '@readycircle/observability';

/**
 * Envelope every queue message is expected to match. Keeping this generic
 * (rather than per-queue schemas) means the poller and registry don't need
 * to know about individual job payload shapes.
 */
export const jobMessageEnvelopeSchema = z.object({
  jobType: z.string().min(1),
  payload: z.unknown().default({}),
});
export type JobMessageEnvelope = z.infer<typeof jobMessageEnvelopeSchema>;

export interface JobContext {
  logger: Logger;
}

export type JobHandler = (payload: unknown, context: JobContext) => Promise<void>;
