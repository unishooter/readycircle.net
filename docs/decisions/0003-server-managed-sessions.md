# 3. Server-managed sessions over stateless JWTs

## Status

Accepted

## Context

The API needs to authenticate every request from the web app, and needs to
support both a development authentication provider (no password) and a
production provider (AWS Cognito) behind the same interface. It also needs
to support immediate session revocation (logout should actually invalidate
a session, not just rely on a client discarding a token) since Circle
membership and station ownership changes have real privacy implications.

## Decision

Use **server-managed sessions**: `packages/auth`'s `SessionManager` creates
a session record (in the `sessions` table) and issues an HttpOnly, signed
cookie (`rc_session`) containing only an opaque session ID. Every request
resolves `request.userId` by looking up that session server-side (a
Fastify plugin, `apps/api/src/plugins/session.ts`), rather than decoding a
self-contained JWT.

## Consequences

- Logout (`POST /api/v1/logout`) immediately and unconditionally revokes
  access -- there's no window where a stolen or leaked token remains valid
  until expiry, unlike stateless JWTs, which would need a revocation list
  to achieve the same guarantee.
- Every authenticated request costs one extra database lookup (session ->
  user), which is an acceptable tradeoff at current scale; if this becomes
  a bottleneck, a cache (e.g. in-memory LRU or Redis) can sit in front of
  the session lookup without changing the interface.
- Both `DevAuthProvider` and `CognitoAuthProvider` converge on the same
  `SessionManager`, so route handlers never need to know which identity
  provider authenticated the current user.
- The session cookie is HttpOnly and never exposed to client-side
  JavaScript, and cookie values are included in the logger's redaction
  paths (`packages/observability`), so a logging bug can't leak a session
  identifier.
- This does not horizontally scale the API for free the way fully stateless
  auth would -- but since sessions live in the same PostgreSQL database
  every API instance already talks to, there's no additional
  infrastructure required to share session state across instances behind
  the ALB.
