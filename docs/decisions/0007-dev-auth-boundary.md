# 7. A hard boundary around development authentication

## Status

Accepted

## Context

Fast local iteration benefits enormously from being able to sign in as any
seeded user with no password and no external identity provider dependency.
But an authentication bypass like that is exactly the kind of thing that
must never reach a production environment, even accidentally (e.g. a
misconfigured environment variable on a staging or production instance).

## Decision

Make development authentication opt-in via `DEV_AUTH_ENABLED`, and enforce
the production boundary in **one place**: `packages/config`'s `loadConfig`.
If `APP_ENV=production` and `DEV_AUTH_ENABLED=true`, the process refuses to
start unless `DEV_AUTH_UNSAFE_OVERRIDE=true` is *also* explicitly set --
a second, deliberately loudly-named variable that a deploy would have to
set on purpose. `apps/api`'s dev-auth routes
(`modules/session/routes.ts`) are only registered at all when
`config.devAuth.enabled` is true, so in a correctly configured production
environment the routes don't exist on the server, not merely
"require a header to access."

## Consequences

- A misconfigured `DEV_AUTH_ENABLED=true` left over from a staging
  environment variable template fails closed: the API process exits
  immediately at startup with a clear error, rather than silently exposing
  a password-free login endpoint.
- Bypassing that protection requires setting *two* environment variables,
  one of which (`DEV_AUTH_UNSAFE_OVERRIDE`) exists specifically to make
  doing so unmissable in a code review of environment configuration or an
  infrastructure diff.
- Because the check lives in `packages/config` (shared by both `apps/api`
  and `apps/worker`), any future process that loads configuration the same
  way inherits the same protection automatically -- there's no second
  place this logic needs to be duplicated or kept in sync.
- Tests and local development set `DEV_AUTH_ENABLED=true` with
  `APP_ENV=development` (or `test`), which is unaffected by this guard --
  the restriction only activates when `APP_ENV=production`.
