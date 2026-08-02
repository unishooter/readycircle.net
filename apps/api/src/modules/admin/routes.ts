import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  adminUserSummarySchema,
  listResponseSchema,
  platformSettingsResponseSchema,
  setUserAdminSchema,
  updatePlatformSettingsSchema,
  uuidSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { AdminService } from './service.js';

const userParamsSchema = z.object({ userId: uuidSchema });

/** Every route here calls `requireAuth` then `requireAdmin` -- server-enforced regardless of client-side nav gating. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AdminService(app.db, app.config, app.auditService);

  app.get(
    '/admin/users',
    { schema: { tags: ['admin'], response: { 200: listResponseSchema(adminUserSummarySchema) } } },
    async (request) => {
      const userId = requireAuth(request);
      await service.requireAdmin(userId);
      return { items: await service.listUsers() };
    },
  );

  app.patch(
    '/admin/users/:userId',
    {
      schema: {
        tags: ['admin'],
        params: userParamsSchema,
        body: setUserAdminSchema,
        response: { 200: adminUserSummarySchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      await service.requireAdmin(userId);
      return service.setUserAdmin(request.params.userId, request.body.isAdmin, userId, request.id);
    },
  );

  app.get(
    '/admin/settings',
    { schema: { tags: ['admin'], response: { 200: platformSettingsResponseSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      await service.requireAdmin(userId);
      return service.getSettings();
    },
  );

  app.patch(
    '/admin/settings',
    {
      schema: {
        tags: ['admin'],
        body: updatePlatformSettingsSchema,
        response: { 200: platformSettingsResponseSchema },
      },
    },
    async (request) => {
      const userId = requireAuth(request);
      await service.requireAdmin(userId);
      return service.updateSettings(request.body, userId, request.id);
    },
  );
};
