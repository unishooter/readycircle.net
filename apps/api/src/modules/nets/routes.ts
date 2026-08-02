import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  closeNetSessionSchema,
  createNetSchema,
  listResponseSchema,
  netDetailResponseSchema,
  netResponseSchema,
  netSessionResponseSchema,
  openNetSessionSchema,
  recordCheckinSchema,
  updateNetSchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { NoopNetReminderService } from './reminders.js';
import { NetService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const netParamsSchema = z.object({ netId: uuidSchema });
const sessionParamsSchema = z.object({ netId: uuidSchema, sessionId: uuidSchema });
const checkinParamsSchema = z.object({ netId: uuidSchema, sessionId: uuidSchema, stationId: uuidSchema });

export const netRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new NetService(app.db, app.auditService, new NoopNetReminderService(app.log));

  app.get(
    '/nets',
    { schema: { tags: ['nets'], response: { 200: listResponseSchema(netResponseSchema) } } },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForUser(userId) };
    },
  );

  app.get(
    '/circles/:circleId/nets',
    {
      schema: {
        tags: ['nets'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(netResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForCircle(request.params.circleId, userId) };
    },
  );

  app.post(
    '/circles/:circleId/nets',
    {
      schema: {
        tags: ['nets'],
        params: circleParamsSchema,
        body: createNetSchema,
        response: { 201: netResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const net = await service.createNet(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return net;
    },
  );

  app.get(
    '/nets/:netId',
    { schema: { tags: ['nets'], params: netParamsSchema, response: { 200: netDetailResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.getNet(request.params.netId, userId);
    },
  );

  app.patch(
    '/nets/:netId',
    {
      schema: {
        tags: ['nets'],
        params: netParamsSchema,
        body: updateNetSchema,
        response: { 200: netResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.updateNet(request.params.netId, userId, request.body, request.id);
    },
  );

  app.post(
    '/nets/:netId/archive',
    { schema: { tags: ['nets'], params: netParamsSchema, response: { 200: netResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.archiveNet(request.params.netId, userId, request.id);
    },
  );

  app.post(
    '/nets/:netId/sessions',
    {
      schema: {
        tags: ['nets'],
        params: netParamsSchema,
        body: openNetSessionSchema,
        response: { 201: netSessionResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const session = await service.openSession(request.params.netId, userId, request.body, request.id);
      reply.status(201);
      return session;
    },
  );

  app.post(
    '/nets/:netId/sessions/:sessionId/close',
    {
      schema: {
        tags: ['nets'],
        params: sessionParamsSchema,
        body: closeNetSessionSchema,
        response: { 200: netSessionResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.closeSession(
        request.params.netId,
        request.params.sessionId,
        userId,
        request.body,
        request.id,
      );
    },
  );

  app.post(
    '/nets/:netId/sessions/:sessionId/checkins',
    {
      schema: {
        tags: ['nets'],
        params: sessionParamsSchema,
        body: recordCheckinSchema,
        response: { 201: netSessionResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const session = await service.recordCheckin(
        request.params.netId,
        request.params.sessionId,
        userId,
        request.body,
        request.id,
      );
      reply.status(201);
      return session;
    },
  );

  app.delete(
    '/nets/:netId/sessions/:sessionId/checkins/:stationId',
    {
      schema: {
        tags: ['nets'],
        params: checkinParamsSchema,
        response: { 200: netSessionResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.removeCheckin(
        request.params.netId,
        request.params.sessionId,
        request.params.stationId,
        userId,
      );
    },
  );
};
