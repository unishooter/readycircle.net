import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createStationSchema,
  listResponseSchema,
  setStationRepeatersSchema,
  stationRepeaterOptionSchema,
  stationRepeaterResponseSchema,
  stationResponseSchema,
  updateStationSchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { StationService } from './service.js';

const stationParamsSchema = z.object({ stationId: uuidSchema });

export const stationRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new StationService(app.db, app.auditService);

  app.get(
    '/stations',
    { schema: { tags: ['stations'], response: { 200: listResponseSchema(stationResponseSchema) } } },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listMyStations(userId) };
    },
  );

  app.post(
    '/stations',
    { schema: { tags: ['stations'], body: createStationSchema, response: { 201: stationResponseSchema } } },
    async (request, reply) => {
      const userId = requireAuth(request);
      const station = await service.createStation(userId, request.body, request.id);
      reply.status(201);
      return station;
    },
  );

  app.get(
    '/stations/:stationId',
    { schema: { tags: ['stations'], params: stationParamsSchema, response: { 200: stationResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.getStation(request.params.stationId, userId);
    },
  );

  app.patch(
    '/stations/:stationId',
    {
      schema: {
        tags: ['stations'],
        params: stationParamsSchema,
        body: updateStationSchema,
        response: { 200: stationResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.updateStation(request.params.stationId, userId, request.body, request.id);
    },
  );

  app.delete(
    '/stations/:stationId',
    { schema: { tags: ['stations'], params: stationParamsSchema, response: { 200: stationResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.archiveStation(request.params.stationId, userId, request.id);
    },
  );

  app.get(
    '/stations/:stationId/available-repeaters',
    {
      schema: {
        tags: ['stations'],
        params: stationParamsSchema,
        response: { 200: listResponseSchema(stationRepeaterOptionSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listAvailableRepeaters(request.params.stationId, userId) };
    },
  );

  app.get(
    '/stations/:stationId/repeaters',
    {
      schema: {
        tags: ['stations'],
        params: stationParamsSchema,
        response: { 200: listResponseSchema(stationRepeaterResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listRepeaterLinks(request.params.stationId, userId) };
    },
  );

  app.put(
    '/stations/:stationId/repeaters',
    {
      schema: {
        tags: ['stations'],
        params: stationParamsSchema,
        body: setStationRepeatersSchema,
        response: { 200: listResponseSchema(stationRepeaterResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return {
        items: await service.setRepeaterLinks(request.params.stationId, userId, request.body, request.id),
      };
    },
  );
};
