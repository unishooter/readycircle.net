import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  acceptCircleInviteSchema,
  circleInviteCreatedResponseSchema,
  circleInvitePreviewResponseSchema,
  circleInviteSummarySchema,
  createCircleInviteSchema,
  listResponseSchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { InviteService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const inviteParamsSchema = z.object({ inviteId: uuidSchema });
const tokenParamsSchema = z.object({ token: z.string().min(1) });

export const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new InviteService(app.db, app.config, app.auditService);

  app.post(
    '/circles/:circleId/invites',
    {
      schema: {
        tags: ['invites'],
        params: circleParamsSchema,
        body: createCircleInviteSchema,
        response: { 201: circleInviteCreatedResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const invite = await service.createInvite(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return invite;
    },
  );

  app.get(
    '/circles/:circleId/invites',
    {
      schema: {
        tags: ['invites'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(circleInviteSummarySchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listInvites(request.params.circleId, userId) };
    },
  );

  app.post(
    '/circle-invites/:inviteId/revoke',
    {
      schema: {
        tags: ['invites'],
        params: inviteParamsSchema,
        response: { 200: circleInviteSummarySchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.revokeInvite(request.params.inviteId, userId, request.id);
    },
  );

  app.get(
    '/invites/:token',
    {
      schema: {
        tags: ['invites'],
        params: tokenParamsSchema,
        response: { 200: circleInvitePreviewResponseSchema },
      },
    },
    async (request) => service.previewInvite(request.params.token),
  );

  app.post(
    '/invites/:token/accept',
    {
      schema: {
        tags: ['invites'],
        params: tokenParamsSchema,
        body: acceptCircleInviteSchema,
        response: { 200: circleInviteSummarySchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.acceptInvite(request.params.token, userId, request.body, request.id);
    },
  );
};
