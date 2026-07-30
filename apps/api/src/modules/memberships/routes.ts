import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createMembershipSchema, listResponseSchema, membershipResponseSchema, updateMembershipSchema, uuidSchema } from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { MembershipService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const memberParamsSchema = z.object({ circleId: uuidSchema, membershipId: uuidSchema });

export const membershipRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new MembershipService(app.db, app.auditService);

  app.get(
    '/circles/:circleId/members',
    { schema: { tags: ['memberships'], params: circleParamsSchema, response: { 200: listResponseSchema(membershipResponseSchema) } } },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listMembers(request.params.circleId, userId) };
    },
  );

  app.post(
    '/circles/:circleId/members',
    {
      schema: {
        tags: ['memberships'],
        params: circleParamsSchema,
        body: createMembershipSchema,
        response: { 201: membershipResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const membership = await service.addMember(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return membership;
    },
  );

  app.patch(
    '/circles/:circleId/members/:membershipId',
    {
      schema: {
        tags: ['memberships'],
        params: memberParamsSchema,
        body: updateMembershipSchema,
        response: { 200: membershipResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return service.updateMember(request.params.circleId, request.params.membershipId, userId, request.body, request.id);
    },
  );

  app.delete(
    '/circles/:circleId/members/:membershipId',
    { schema: { tags: ['memberships'], params: memberParamsSchema, response: { 200: membershipResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.removeMember(request.params.circleId, request.params.membershipId, userId, request.id);
    },
  );
};
