import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { SESSION_COOKIE_NAME, DevAuthProvider } from '@readycircle/auth';
import { devLoginRequestSchema, devUserSummarySchema, listResponseSchema, sessionResponseSchema } from '@readycircle/contracts';
import { getCurrentUserById } from '../users/repository.js';
import { NotFoundError } from '../../lib/errors.js';

/**
 * Session, logout, and development-login routes. The `/dev-auth/*` routes
 * are only registered when `config.devAuth.enabled` is true -- outside of
 * development this whole block simply never runs, so there is no
 * production code path that can accidentally expose it.
 */
export const sessionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/session', { schema: { tags: ['session'], response: { 200: sessionResponseSchema } } }, async (request) => {
    const devAuthEnabled = app.config.devAuth.enabled;
    if (!request.userId) {
      return { authenticated: false, user: null, devAuthEnabled };
    }
    const user = await getCurrentUserById(app.db, request.userId);
    if (!user) {
      return { authenticated: false, user: null, devAuthEnabled };
    }
    return { authenticated: true, user, devAuthEnabled };
  });

  app.post('/logout', { schema: { tags: ['session'], response: { 200: z.object({ success: z.literal(true) }) } } }, async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await app.sessionManager.revokeSession(token);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { success: true as const };
  });

  if (app.config.devAuth.enabled) {
    const devProvider = new DevAuthProvider(app.db);

    app.get(
      '/dev-auth/users',
      { schema: { tags: ['dev-auth'], response: { 200: listResponseSchema(devUserSummarySchema) } } },
      async () => ({ items: await devProvider.listUsers() }),
    );

    app.post(
      '/dev-auth/login',
      { schema: { tags: ['dev-auth'], body: devLoginRequestSchema, response: { 200: sessionResponseSchema } } },
      async (request, reply) => {
        const { userId } = await devProvider.loginOrCreate(request.body);
        const session = await app.sessionManager.createSession(userId);
        reply.setCookie(SESSION_COOKIE_NAME, session.token, {
          httpOnly: true,
          secure: app.config.isProduction,
          sameSite: 'lax',
          path: '/',
          expires: session.expiresAt,
        });
        const user = await getCurrentUserById(app.db, userId);
        if (!user) throw new NotFoundError('Development user not found after login.');
        return { authenticated: true, user, devAuthEnabled: true };
      },
    );
  }
};
