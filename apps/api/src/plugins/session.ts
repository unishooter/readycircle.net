import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME, type SessionManager } from '@readycircle/auth';
import { UnauthorizedError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
}

/**
 * Resolves the session cookie (if any) into `request.userId` on every
 * request. Routes that require authentication call `requireAuth(request)`
 * explicitly rather than relying on an implicit global guard, so each
 * route's authorization requirements stay visible at the route
 * declaration.
 */
export function registerSessionPlugin(app: FastifyInstance, sessionManager: SessionManager): void {
  app.decorateRequest('userId', null);

  app.addHook('onRequest', async (request) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      request.userId = null;
      return;
    }
    const result = await sessionManager.validateSession(token);
    request.userId = result?.userId ?? null;
  });
}

export function requireAuth(request: FastifyRequest): string {
  if (!request.userId) {
    throw new UnauthorizedError();
  }
  return request.userId;
}
