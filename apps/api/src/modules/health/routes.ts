import type { FastifyPluginAsync } from 'fastify';
import { pingDatabase } from '@readycircle/database';
import { z } from 'zod';

const healthResponseSchema = z.object({ status: z.enum(['ok', 'error']) });

/**
 * `/health/live` only proves the process is up. `/health/ready` also
 * checks Postgres connectivity, per the ALB health check contract, and
 * deliberately does not depend on S3, SQS, or any other optional external
 * service.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/live', { schema: { response: { 200: healthResponseSchema } } }, async () => ({ status: 'ok' as const }));

  app.get('/ready', { schema: { response: { 200: healthResponseSchema, 503: healthResponseSchema } } }, async (request, reply) => {
    try {
      await pingDatabase(app.db);
      return { status: 'ok' as const };
    } catch (error) {
      request.log.error({ err: error }, 'readiness check failed: database unreachable');
      reply.status(503);
      return { status: 'error' as const };
    }
  });
};
