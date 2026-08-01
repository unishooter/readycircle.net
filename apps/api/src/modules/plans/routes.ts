import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createPlanSchema,
  listResponseSchema,
  planDetailResponseSchema,
  planResponseSchema,
  planVersionDetailSchema,
  planVersionSummarySchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { PlanService } from './service.js';

const circleParamsSchema = z.object({ circleId: uuidSchema });
const planParamsSchema = z.object({ planId: uuidSchema });
const versionParamsSchema = z.object({ planId: uuidSchema, versionId: uuidSchema });

export const planRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new PlanService(app.db, app.auditService, app.planJobDispatcher, app.planDocumentStore);

  app.get(
    '/plans',
    { schema: { tags: ['plans'], response: { 200: listResponseSchema(planResponseSchema) } } },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForUser(userId) };
    },
  );

  app.get(
    '/circles/:circleId/plans',
    {
      schema: {
        tags: ['plans'],
        params: circleParamsSchema,
        response: { 200: listResponseSchema(planResponseSchema) },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      return { items: await service.listForCircle(request.params.circleId, userId) };
    },
  );

  app.post(
    '/circles/:circleId/plans',
    {
      schema: {
        tags: ['plans'],
        params: circleParamsSchema,
        body: createPlanSchema,
        response: { 201: planResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireAuth(request);
      const plan = await service.createPlan(request.params.circleId, userId, request.body, request.id);
      reply.status(201);
      return plan;
    },
  );

  app.get(
    '/plans/:planId',
    { schema: { tags: ['plans'], params: planParamsSchema, response: { 200: planDetailResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.getPlan(request.params.planId, userId);
    },
  );

  app.post(
    '/plans/:planId/regenerate',
    { schema: { tags: ['plans'], params: planParamsSchema, response: { 201: planResponseSchema } } },
    async (request, reply) => {
      const userId = requireAuth(request);
      const plan = await service.regenerate(request.params.planId, userId, request.id);
      reply.status(201);
      return plan;
    },
  );

  app.get(
    '/plans/:planId/versions/:versionId',
    { schema: { tags: ['plans'], params: versionParamsSchema, response: { 200: planVersionDetailSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.getVersion(request.params.planId, request.params.versionId, userId);
    },
  );

  app.post(
    '/plans/:planId/versions/:versionId/publish',
    { schema: { tags: ['plans'], params: versionParamsSchema, response: { 200: planVersionSummarySchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.publish(request.params.planId, request.params.versionId, userId, request.id);
    },
  );

  // Binary response -- no Zod response schema; headers set manually.
  app.get(
    '/plans/:planId/versions/:versionId/document',
    { schema: { tags: ['plans'], params: versionParamsSchema } },
    async (request, reply) => {
      const userId = requireAuth(request);
      const download = await service.getDocumentDownload(request.params.planId, request.params.versionId, userId);
      reply
        .header('content-type', download.contentType)
        .header('content-disposition', `attachment; filename="${download.filename}"`);
      return reply.send(Buffer.from(download.body));
    },
  );
};
