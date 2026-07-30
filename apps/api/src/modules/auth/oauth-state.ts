import type { FastifyReply, FastifyRequest } from 'fastify';

const OAUTH_STATE_COOKIE = 'rc_oauth_pending';
const OAUTH_STATE_TTL_SECONDS = 60 * 10;
/** Scoped to the auth routes only -- never sent alongside normal app/API requests. */
const OAUTH_STATE_COOKIE_PATH = '/api/v1/auth';

interface OAuthPendingState {
  state: string;
  codeVerifier: string;
}

/**
 * Stores the CSRF `state` and PKCE `codeVerifier` for an in-flight Cognito
 * login in a short-lived signed cookie rather than server-side memory or a
 * database table. The API runs behind an ALB across multiple EC2
 * instances with no sticky sessions, so whichever instance happens to
 * handle the callback request must be able to validate it without having
 * seen the original `/auth/login` request.
 */
export function setOAuthPendingCookie(reply: FastifyReply, pending: OAuthPendingState, isProduction: boolean): void {
  reply.setCookie(OAUTH_STATE_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    signed: true,
  });
}

/** Reads and immediately clears the pending-OAuth cookie; returns `null` if it is missing, unsigned, or malformed. */
export function readAndClearOAuthPendingCookie(request: FastifyRequest, reply: FastifyReply): OAuthPendingState | null {
  const raw = request.cookies?.[OAUTH_STATE_COOKIE];
  reply.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_COOKIE_PATH });
  if (!raw) return null;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;

  try {
    const parsed = JSON.parse(unsigned.value) as Partial<OAuthPendingState>;
    if (typeof parsed.state !== 'string' || typeof parsed.codeVerifier !== 'string') return null;
    return { state: parsed.state, codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
}
