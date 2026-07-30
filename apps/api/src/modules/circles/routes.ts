import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { circleResponseSchema, createCircleSchema, listResponseSchema, updateCircleSchema, uuidSchema } from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { CircleService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });

export const circleRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new CircleService(app.db, app.auditService);

  app.get(
    '/circles',
    { schema: { tags: ['circles'], response: { 200: listResponseSchema(circleResponseSchema) } } },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listMyCircles(userId) };
    },
  );

  app.post(
    '/circles',
    { schema: { tags: ['circles'], body: createCircleSchema, response: { 201: circleResponseSchema } } },
    async (request, reply) => {
      const userId = requireAuth(request);
      const circle = await service.createCircle(userId, request.body, request.id);
      reply.status(201);
      return circle;
    },
  );

  app.get(
    '/circles/:circleId',
    { schema: { tags: ['circles'], params: circleParamsSchema, response: { 200: circleResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.getCircle(request.params.circleId, userId);
    },
  );

  app.patch(
    '/circles/:circleId',
    {
      schema: {
        tags: ['circles'],
        params: circleParamsSchema,
        body: updateCircleSchema,
        response: { 200: circleResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.updateCircle(request.params.circleId, userId, request.body, request.id);
    },
  );

  app.delete(
    '/circles/:circleId',
    { schema: { tags: ['circles'], params: circleParamsSchema, response: { 200: circleResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.archiveCircle(request.params.circleId, userId, request.id);
    },
  );
};
