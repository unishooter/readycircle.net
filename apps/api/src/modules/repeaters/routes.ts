import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createRepeaterSchema,
  importRepeatersSchema,
  listResponseSchema,
  repeaterImportSearchQuerySchema,
  repeaterImportSearchResponseSchema,
  repeaterResponseSchema,
  updateRepeaterSchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { RepeaterDirectoryService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const repeaterParamsSchema = z.object({ repeaterId: uuidSchema });

export const repeaterRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new RepeaterDirectoryService(app.db, app.auditService, app.config);

  app.get(
    '/circles/:circleId/repeaters',
    {
      schema: {
        tags: ['repeaters'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(repeaterResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.list(request.params.circleId, userId) };
    },
  );

  app.post(
    '/circles/:circleId/repeaters',
    {
      schema: {
        tags: ['repeaters'],
        params: circleParamsSchema,
        body: createRepeaterSchema,
        response: { 201: repeaterResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const repeater = await service.create(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return repeater;
    },
  );

  app.patch(
    '/repeaters/:repeaterId',
    {
      schema: {
        tags: ['repeaters'],
        params: repeaterParamsSchema,
        body: updateRepeaterSchema,
        response: { 200: repeaterResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.update(request.params.repeaterId, userId, request.body, request.id);
    },
  );

  app.delete(
    '/repeaters/:repeaterId',
    {
      schema: {
        tags: ['repeaters'],
        params: repeaterParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      await service.remove(request.params.repeaterId, userId, request.id);
      reply.status(204);
      return null;
    },
  );

  app.get(
    '/circles/:circleId/repeaters/import-search',
    {
      schema: {
        tags: ['repeaters'],
        params: circleParamsSchema,
        querystring: repeaterImportSearchQuerySchema,
        response: { 200: repeaterImportSearchResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.importSearch(request.params.circleId, userId, request.query);
    },
  );

  app.post(
    '/circles/:circleId/repeaters/import',
    {
      schema: {
        tags: ['repeaters'],
        params: circleParamsSchema,
        body: importRepeatersSchema,
        response: { 201: listResponseSchema(repeaterResponseSchema) },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const items = await service.importSelected(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return { items };
    },
  );
};
