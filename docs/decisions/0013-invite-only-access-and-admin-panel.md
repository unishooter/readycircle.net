# 13. Invite-only access, single-use Circle invite links, and a minimal admin panel

## Status

Accepted

## Context

The app has been open sign-up since launch: anyone who reaches the login
page can create an account. As the userbase grows beyond people who found
the app organically, there needs to be a way to gate new account creation
behind a real-world introduction -- "a Circle member vouched for you" --
without blocking the people who already have accounts, and without
building out email delivery (SES) yet. There was also no concept of a
platform-wide admin: every prior authorization decision
(`packages/domain`) was scoped to a Circle (coordinator vs. member), which
is the wrong shape for "who can flip the invite-only switch for the whole
app."

## Decision

- **`INVITE_ONLY_ACCESS` is forward-only and env-default + admin-override.**
  `packages/config` reads `INVITE_ONLY_ACCESS` as the fallback; a
  `platform_settings` row (`key = 'invite_only_access'`, jsonb `value`) can
  override it at runtime from the admin panel. A missing row means "no
  override, follow the env default" -- `resolveInviteOnlyAccess(envDefault,
  override)` in `packages/domain/src/admin-authorization.ts` is the single
  pure function both the sign-up gate and the admin API read through. The
  gate only ever blocks *creating a brand-new account*; a returning user
  who already has one can always sign back in, regardless of the setting.
  This mirrors dev-auth's env-gated-but-not-account-gated precedent
  ([0007](0007-dev-auth-boundary.md)) and means turning the flag on can
  never lock out someone who already has an account.
- **`platform_settings` is a generic key/value table, not
  invite-only-specific.** `platform_settings(key text primary key, value
  jsonb not null, updated_at, updated_by)` is intentionally schemaless so
  future admin-configurable settings don't each need their own migration
  and their own admin-API round trip -- just another key.
- **Grandfather every existing user in as an admin, once, at migration
  time.** Before this feature there was no admin concept, so there is no
  "first admin" to bootstrap from; the migration runs `UPDATE users SET
  is_admin = true` unconditionally. This satisfies "at least one admin
  must always exist" for free and avoids a chicken-and-egg lockout on
  deploy. `is_admin` is a platform-wide flag on `users`, deliberately
  separate from the Circle-scoped `coordinator`/`member` roles that already
  existed -- an admin manages the platform, not any particular Circle.
- **A "last admin" safeguard mirrors the existing "last coordinator"
  one.** `wouldLeaveAppWithoutAdmin(remainingActiveAdminCount,
  targetIsCurrentlyAdmin)` in `admin-authorization.ts` is the same shape as
  `wouldLeaveCircleWithoutCoordinator` in `circle-authorization.ts`
  ([0004](0004-user-station-identity-separation.md)'s authorization
  layer): the admin API (`apps/api/src/modules/admin/service.ts`) checks it
  before demoting, so the last admin can never demote themselves (or be
  demoted) into zero admins.
- **Circle invites are single-use, HMAC-hashed tokens, not JWTs.** Any
  active Circle member (not just coordinators -- the same "members know
  best" precedent as the repeater directory,
  [0012](0012-repeaters-gear-check-scenarios.md)) can create one. The raw
  token (`randomBytes(32).toString('hex')`) is shown exactly once, at
  creation, in the response body -- never persisted or retrievable again,
  the same one-time-reveal discipline the session cookie already uses
  ([0003](0003-server-managed-sessions.md)). Only its HMAC-SHA256 hash
  (keyed with the same `SESSION_SECRET` `SessionManager` uses for session
  tokens) is stored in `circle_invitations.token_hash`, so a database leak
  doesn't hand out usable invite links any more than it would hand out
  usable session tokens. Invites expire after 14 days and become `accepted`
  the instant someone joins with them -- `status` is a real, persisted
  `'pending' | 'accepted' | 'revoked'` enum, while `expired` is a derived
  display value computed at read time from `expires_at`, never written
  back (avoiding a background sweep job for something with no side
  effects until read).
- **No SES integration; the inviter copies a link.** `createInvite`
  returns `inviteUrl` in the response; the Circle UI shows it once with
  "copy this link and send it via email or text." This defers email
  deliverability, bounce handling, and template design entirely -- an SES
  integration can later replace "copy the link" with "send the email"
  without changing the underlying invite model at all.
- **The invite lands on the station wizard, not a separate join form.**
  `/invite/:token` is a public page (outside the authenticated app shell)
  that previews the invite (`GET /invites/:token`, no auth required),
  handles sign-in/sign-up with the token carried through
  (`?inviteToken=` on the OAuth routes, an `inviteToken` field on
  dev-auth), and then -- reusing existing flows rather than inventing a
  parallel "accept invite" UI -- either lets an existing user with a
  station join immediately, or deep-links to the same station wizard used
  for onboarding, which calls `POST /invites/:token/accept` on successful
  creation. A user who already has a station never has to create a
  second one just to join a new Circle.

## Consequences

- Because the gate is forward-only, deploying this feature is safe by
  construction: no existing user session or account can be invalidated by
  turning `INVITE_ONLY_ACCESS` on, and the admin override can always be
  cleared by any admin if it's turned on by mistake.
- The `platform_settings` table means the *next* admin-configurable
  runtime setting (rate limits, feature flags, maintenance mode, etc.)
  needs zero new migrations -- just a new key, a domain-level resolver
  function, and an admin-panel control.
- Reusing the station wizard for invite acceptance means gear-check,
  scenario, and RF-reachability features ([0012](0012-repeaters-gear-check-scenarios.md))
  automatically benefit from every invited station the same way they
  benefit from any other -- there's no "invited stations are second-class"
  edge case to maintain.
- The admin panel is deliberately minimal (v1): a user list with
  promote/demote and the invite-only override. There is no cross-Circle
  invite dashboard, no account suspension, and no audit-log viewer UI yet
  -- audit rows are recorded (`invite.created/accepted/revoked`,
  `admin.granted/revoked`, `settings.updated`) so a future admin-panel
  iteration can surface them without another migration.
- Integration tests that exercise the real invite-only sign-up gate
  end-to-end need a genuinely separate `INVITE_ONLY_ACCESS=true` server
  instance (`apps/api/src/modules/session/session.test.ts`) rather than
  toggling the shared `platform_settings` override, because the override
  is real global state shared by every test file connected to the same
  database. The test suite now runs with `fileParallelism: false`
  (`vitest.config.ts`) so a settings round-trip test in one file can't
  race a concurrent dev-auth login in another.
