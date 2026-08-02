import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contactResponseSchema, listResponseSchema, logContactSchema, uuidSchema } from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { ContactService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const stationParamsSchema = z.object({ stationId: uuidSchema });
const contactParamsSchema = z.object({ contactId: uuidSchema });

export const contactRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ContactService(app.db, app.auditService);

  app.post(
    '/circles/:circleId/contacts',
    {
      schema: {
        tags: ['contacts'],
        params: circleParamsSchema,
        body: logContactSchema,
        response: { 201: contactResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const contact = await service.logContact(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return contact;
    },
  );

  app.get(
    '/circles/:circleId/contacts',
    {
      schema: {
        tags: ['contacts'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(contactResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForCircle(request.params.circleId, userId) };
    },
  );

  app.get(
    '/stations/:stationId/contacts',
    {
      schema: {
        tags: ['contacts'],
        params: stationParamsSchema,
        response: { 200: listResponseSchema(contactResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForStation(request.params.stationId, userId) };
    },
  );

  app.get(
    '/contacts',
    {
      schema: {
        tags: ['contacts'],
        response: { 200: listResponseSchema(contactResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listMine(userId) };
    },
  );

  app.delete(
    '/contacts/:contactId',
    {
      schema: {
        tags: ['contacts'],
        params: contactParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      await service.deleteContact(request.params.contactId, userId, request.id);
      reply.status(204);
      return null;
    },
  );
};
