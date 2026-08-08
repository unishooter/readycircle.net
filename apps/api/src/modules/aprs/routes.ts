import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { aprsPositionResponseSchema, listResponseSchema, uuidSchema } from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { AprsPositionsService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });

export const aprsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AprsPositionsService(app.db, app.config);

  app.get(
    '/circles/:circleId/aprs-positions',
    {
      schema: {
        tags: ['aprs'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(aprsPositionResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.list(request.params.circleId, userId) };
    },
  );
};
