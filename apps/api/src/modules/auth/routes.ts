import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CognitoAuthProvider,
  SESSION_COOKIE_NAME,
  findOrCreateUserByProviderIdentity,
  generatePkcePair,
  generateState,
  hasProviderIdentity,
} from '@readycircle/auth';
import { getInviteOnlyAccess } from '../admin/effective-settings.js';
import { isCircleInviteTokenValid } from '../invites/service.js';
import { readAndClearOAuthPendingCookie, setOAuthPendingCookie } from './oauth-state.js';

const startAuthorizeQuerySchema = z.object({
  inviteToken: z.string().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Production sign-in via Amazon Cognito, only registered when
 * `config.cognito.isConfigured` is true (see `server.ts`) -- mirroring how
 * the dev-auth routes only exist when `config.devAuth.enabled` is true, so
 * a misconfigured environment fails closed rather than exposing a
 * half-working login button.
 *
 * `/auth/google` and `/auth/login` both start the same Authorization
 * Code + PKCE flow against Cognito; the only difference is whether
 * `identity_provider=Google` is set, which skips Cognito's own picker
 * screen and sends the browser straight to Google's consent screen.
 * Both land on the same `/auth/callback`, since Cognito funnels every
 * enabled sign-in method (native username/password or a federated IdP)
 * through one authorization code regardless of which was used.
 */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const cognito = new CognitoAuthProvider(app.config.cognito);

  function redirectToLoginWithError(reply: FastifyReply, error: string) {
    const loginUrl = new URL('/login', app.config.appBaseUrl);
    loginUrl.searchParams.set('error', error);
    return reply.redirect(loginUrl.toString());
  }

  function startAuthorize(identityProvider?: 'Google') {
    return async (request: { query: z.infer<typeof startAuthorizeQuerySchema> }, reply: FastifyReply) => {
      const state = generateState();
      const { codeVerifier, codeChallenge } = generatePkcePair();
      setOAuthPendingCookie(
        reply,
        { state, codeVerifier, inviteToken: request.query.inviteToken },
        app.config.isProduction,
      );
      return reply.redirect(cognito.getAuthorizationUrl({ state, codeChallenge, identityProvider }));
    };
  }

  app.get(
    '/auth/google',
    { schema: { tags: ['auth'], hide: true, querystring: startAuthorizeQuerySchema } },
    startAuthorize('Google'),
  );
  app.get(
    '/auth/login',
    { schema: { tags: ['auth'], hide: true, querystring: startAuthorizeQuerySchema } },
    startAuthorize(),
  );

  app.get(
    '/auth/callback',
    { schema: { tags: ['auth'], hide: true, querystring: callbackQuerySchema } },
    async (request, reply) => {
      const pending = readAndClearOAuthPendingCookie(request, reply);

      if (request.query.error) {
        request.log.info({ error: request.query.error }, 'oauth sign-in cancelled or denied');
        return redirectToLoginWithError(reply, 'oauth_cancelled');
      }

      if (!pending || !request.query.code || !request.query.state || request.query.state !== pending.state) {
        request.log.warn('oauth callback rejected: missing or mismatched state');
        return redirectToLoginWithError(reply, 'oauth_failed');
      }

      try {
        const identity = await cognito.handleCallback({ code: request.query.code, codeVerifier: pending.codeVerifier });

        // Existing users (returning sign-in) are never blocked, regardless
        // of invite-only or token presence -- only a brand-new account
        // needs a valid invite. Checked *before* creating anything so a
        // rejected sign-up leaves no orphaned user/identity rows.
        const isReturningUser = await hasProviderIdentity(app.db, identity.provider, identity.providerSubject);
        if (!isReturningUser) {
          const inviteOnly = await getInviteOnlyAccess(app.db, app.config);
          if (inviteOnly) {
            const tokenValid = pending.inviteToken
              ? await isCircleInviteTokenValid(app.db, app.config, pending.inviteToken)
              : false;
            if (!tokenValid) {
              request.log.info('oauth sign-up rejected: invite-only access is enabled and no valid invite was provided');
              return redirectToLoginWithError(reply, 'invite_required');
            }
          }
        }

        const { userId } = await findOrCreateUserByProviderIdentity(app.db, identity);
        const session = await app.sessionManager.createSession(userId);
        reply.setCookie(SESSION_COOKIE_NAME, session.token, {
          httpOnly: true,
          secure: app.config.isProduction,
          sameSite: 'lax',
          path: '/',
          expires: session.expiresAt,
        });
        return reply.redirect(new URL('/app', app.config.appBaseUrl).toString());
      } catch (error) {
        request.log.error({ err: error }, 'cognito callback failed');
        return redirectToLoginWithError(reply, 'oauth_failed');
      }
    },
  );

  // Clears Cognito's own hosted SSO session, not just ours -- without this,
  // signing out of ReadyCircle and clicking "Continue with Google" again
  // could silently re-authenticate the same account with no prompt.
  app.get('/auth/logout-redirect', { schema: { tags: ['auth'], hide: true } }, async (_request, reply) => {
    return reply.redirect(cognito.getLogoutUrl(app.config.appBaseUrl));
  });
};
