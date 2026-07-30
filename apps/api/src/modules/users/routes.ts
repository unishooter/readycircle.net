import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUserSchema, updateCurrentUserSchema } from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { UserService } from './service.js';

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new UserService(app.db, app.auditService);

  app.get(
    '/users/me',
    { schema: { tags: ['users'], response: { 200: currentUserSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.getMe(userId);
    },
  );

  app.patch(
    '/users/me',
    { schema: { tags: ['users'], body: updateCurrentUserSchema, response: { 200: currentUserSchema } } },
    async (request) => {
      const userId = requireAuth(request);
      return service.updateMe(userId, request.body, request.id);
    },
  );
};
