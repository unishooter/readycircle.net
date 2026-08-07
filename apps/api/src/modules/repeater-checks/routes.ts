import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  listResponseSchema,
  logRepeaterCheckSchema,
  repeaterCheckResponseSchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { RepeaterCheckService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const checkParamsSchema = z.object({ checkId: uuidSchema });

export const repeaterCheckRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new RepeaterCheckService(app.db, app.auditService);

  app.post(
    '/circles/:circleId/repeater-checks',
    {
      schema: {
        tags: ['repeater-checks'],
        params: circleParamsSchema,
        body: logRepeaterCheckSchema,
        response: { 201: repeaterCheckResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const check = await service.logCheck(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return check;
    },
  );

  app.get(
    '/circles/:circleId/repeater-checks',
    {
      schema: {
        tags: ['repeater-checks'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(repeaterCheckResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForCircle(request.params.circleId, userId) };
    },
  );

  app.delete(
    '/repeater-checks/:checkId',
    {
      schema: {
        tags: ['repeater-checks'],
        params: checkParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      await service.deleteCheck(request.params.checkId, userId, request.id);
      reply.status(204);
      return null;
    },
  );
};
