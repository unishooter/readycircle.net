# ReadyCircle.net

ReadyCircle helps families, neighbors, churches, workplaces, and radio
operators build a local communications plan *before* they need it. People
register their **stations** (a radio setup -- handheld, home base, vehicle,
or organization facility), group stations into a **Radio Circle** (a
neighborhood, family, or organization group that communicates together),
and generate a shared **communications plan** -- roster, channel plan, role
assignments, check-in schedule, and gap analysis, with a printable PDF --
for staying in touch when cellular, internet, or power service goes down.
**Nets** turn the plan into a habit: recurring scheduled on-air check-ins
with session logs and per-station participation stats. Circles also keep a
**repeater directory** (manual entry plus RepeaterBook import), and plan
generation is **scenario-aware**: each version targets chosen
circumstances (outage duration and extent) and includes a deterministic
RF **connectivity analysis** plus AI gear recommendations -- including for
*planned* stations that have a location but no equipment yet. A
**contact log** lets any member record a verified QSO with another station
in the same Circle; logged contacts feed straight back into the
connectivity analysis, upgrading an estimated verdict to a confirmed one.
This repository contains the full application: a public landing page, an
authenticated app shell, station and Radio Circle management, AI-assisted
plan generation, nets, a contact log, and the backend/infrastructure those
features run on.

## Architecture

ReadyCircle is a **modular monolith**: one API process and one worker
process, organized into feature modules, backed by a single PostgreSQL
database. This is deliberate for the current stage -- it keeps
transactional integrity simple (e.g. "creating a Circle also assigns its
creator as coordinator" is one transaction) while still being decomposable
later if a module needs to scale independently.

```
┌─────────────┐      ┌──────────────────────────┐      ┌─────────────────┐
│  apps/web   │ ───▶ │        apps/api          │ ───▶ │   PostgreSQL     │
│ React SPA   │      │  Fastify + Zod + Drizzle │      │  + PostGIS       │
└─────────────┘      └──────────────────────────┘      └─────────────────┘
                              │
                              │ SQS (plan / document generation jobs)
                              ▼
                      ┌──────────────────────────┐      ┌─────────────────┐
                      │       apps/worker         │ ───▶ │  S3 (documents) │
                      │   job-handler registry    │      └─────────────────┘
                      └──────────────────────────┘
```

- **`apps/web`** -- Vite + React + React Router + TanStack Query + Tailwind
  CSS. Public landing page, dev login, and an authenticated app shell.
- **`apps/api`** -- Fastify + Zod (via `fastify-type-provider-zod`) +
  Drizzle ORM. REST endpoints under `/api/v1`, plus `/health/live` and
  `/health/ready`.
- **`apps/worker`** -- long-polls SQS queues and dispatches messages to
  registered job handlers (`plan.generate`, `document.generate`). Runs
  independently of the API so slow/queued work (AI calls, PDF rendering)
  never blocks HTTP requests.
- **`packages/contracts`** -- Zod schemas + inferred TypeScript types
  shared by the API and the web app, so request/response shapes can never
  drift between frontend and backend.
- **`packages/domain`** -- pure business rules (authorization predicates,
  visibility shaping, the net recurrence/occurrence engine, and the RF
  reachability engine behind the plan connectivity section) with no I/O,
  so they're trivial to unit test.
- **`packages/plan-engine`** -- the plan-generation pipeline: Circle context
  builder, deterministic section builders, an `AdvisoryProvider` interface
  with an OpenAI Structured Outputs implementation, PDF rendering
  (`@react-pdf/renderer`), and the S3/local `DocumentStore`. Shared by the
  worker (production) and the API's in-process development fallback -- see
  [ADR 10](docs/decisions/0010-hybrid-ai-plan-generation.md).
- **`packages/geo`** -- pure lat/lng ↔ MGRS grid math (no app dependencies),
  used by both the API and the map picker in the web app.
- **`packages/database`** -- Drizzle ORM schema, migrations, and seed data.
- **`packages/auth`** -- session management plus two authentication
  providers: a development provider (cookie-based, no password) and a real
  Amazon Cognito adapter (Google federation + native email/password) for
  production.
- **`packages/aws`** -- thin wrappers around the AWS SDK v3 (S3, SQS,
  Secrets Manager) so business/worker code never imports the SDK directly.
- **`packages/config`** -- validates `process.env` once, at startup, into a
  typed `AppConfig`; every other module receives that object instead of
  reading `process.env` itself.
- **`packages/observability`** -- structured JSON logging (Pino) with
  secret redaction, and request-ID propagation.
- **`packages/ui`** -- accessible, shared React primitives (Button, Card,
  Field, Stepper, etc.) used by both the landing page and the app shell.

## Repository structure

```
apps/
  api/          Fastify backend (REST API)
  web/          React frontend (landing page + app shell)
  worker/       Background job processor
packages/
  auth/         Session management + auth provider implementations
  aws/          AWS SDK v3 wrappers (S3, SQS, Secrets Manager)
  config/       Environment variable loading/validation
  contracts/    Shared Zod schemas + types
  database/     Drizzle ORM schema, migrations, seed script
  domain/       Pure business logic (authorization, visibility)
  geo/          Lat/lng <-> MGRS grid conversion
  observability/Structured logging + request IDs
  plan-engine/  Plan generation pipeline (context, AI advisory, PDF, storage)
  ui/           Shared React component primitives
infrastructure/
  nginx/        Nginx site config (static assets + reverse proxy)
  systemd/      systemd unit files for the API and worker
  deployment/   deploy.sh release script
docs/
  decisions/    Architecture Decision Records
  deployment/   Local toolchain setup + deployment runbook
docker-compose.yml   Local PostgreSQL + PostGIS
.env.example         All environment variables, documented
```

## Prerequisites

- **Node.js 20+** and **pnpm** (see `package.json#packageManager`)
- **Docker Desktop** (with WSL2 on Windows) for local PostgreSQL -- see
  [`docs/deployment/local-toolchain.md`](docs/deployment/local-toolchain.md)
  if you need to install it

## Setup

```bash
pnpm install
cp .env.example .env      # adjust values if needed; defaults work locally
docker compose up -d      # starts PostgreSQL + PostGIS
pnpm db:migrate
pnpm db:seed
pnpm dev                  # runs web, api, and worker in parallel
```

- Web app: http://localhost:5173
- API: http://localhost:3000 (proxied from the web app under `/api` and
  `/health` in development -- see `apps/web/vite.config.ts`)
- API docs (Swagger UI): http://localhost:3000/docs

Sign in at `/login` using development authentication: pick one of the
seeded accounts, or create a new one. No password is required.

## Environment variables

See [`.env.example`](.env.example) for the full, documented list. The
notable ones:

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development` \| `test` \| `staging` \| `production`. Gates dev auth and enforces production config checks. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `SESSION_SECRET` | Signs session cookies. Must be a real random value in production (the API refuses to start otherwise). |
| `DEV_AUTH_ENABLED` | Enables passwordless development sign-in. The API refuses to start with this `true` when `APP_ENV=production`, unless `DEV_AUTH_UNSAFE_OVERRIDE=true` is also set. |
| `AWS_REGION`, `AWS_S3_DOCUMENT_BUCKET`, `AWS_SQS_PLAN_QUEUE_URL`, `AWS_SQS_DOCUMENT_QUEUE_URL` | Required in production; the worker idles (with a warning) if a queue URL is unset, which is expected in local development. When the queue URLs are blank, the API runs plan/document generation in-process instead of dispatching to the worker. |
| `COGNITO_*` | Production identity provider config; not required in development. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI plan generation. The key is required in production (set it in both `api.env` and `worker.env`); in development a missing key makes generation fail with a clear message rather than blocking startup. Model defaults to `gpt-5.6-terra`. |
| `DOCUMENT_STORAGE_PATH` | Local directory for rendered plan PDFs when no S3 bucket is configured (default `.data/documents`). |
| `REPEATERBOOK_APP_TOKEN` | Optional in all environments. Enables the "Find repeaters near this Circle" RepeaterBook import (see [ADR 12](docs/decisions/0012-repeaters-gear-check-scenarios.md)); without it the import UI reports "not configured" and manual repeater entry still works. |
| `INVITE_ONLY_ACCESS` | Default `false`. When `true`, brand-new account creation is blocked without a valid Circle invite link; existing users can always sign back in. An admin can override this at runtime from `/app/admin` -- the override takes precedence over this env value. See [ADR 13](docs/decisions/0013-invite-only-access-and-admin-panel.md). |

Configuration is loaded and validated exactly once, at process startup, by
`packages/config`. Invalid or missing required values cause the process to
exit immediately with a readable error instead of failing later at an
unpredictable point.

## Database

- Schema and migrations: `packages/database/src/schema/`, generated via
  Drizzle Kit into `packages/database/drizzle/`.
- `pnpm db:generate` -- generate a new migration from schema changes.
- `pnpm db:migrate` -- apply migrations (also seeds core reference data,
  like circle roles).
- `pnpm db:seed` -- seed development users, sample stations, and a sample
  Circle for local testing.
- PostGIS is used for the `stations.location` geography column; every
  other table uses standard UUID primary keys and `timestamptz` columns.

## Development authentication vs. production authentication

`packages/auth` has two authentication providers:

- **`DevAuthProvider`** -- only registered when `DEV_AUTH_ENABLED=true` and
  `APP_ENV` is not `production` (see the guard above). Lets you sign in as
  any seeded or newly-created user with no password, for fast local
  iteration and tests.
- **`CognitoAuthProvider`** -- a real Amazon Cognito OAuth adapter
  (Authorization Code + PKCE), only registered when all five `COGNITO_*`
  variables are set (`config.cognito.isConfigured`). Cognito is configured
  with two enabled sign-in methods: **Google** as a federated identity
  provider, and Cognito's own native username/password store as an email
  fallback. "Continue with Google"
  (`GET /api/v1/auth/google`) passes `identity_provider=Google` to Cognito's
  authorize endpoint, which skips Cognito's own picker screen and redirects
  straight to Google's consent screen; "Continue with email"
  (`GET /api/v1/auth/login`) shows Cognito's hosted sign-up/sign-in/
  forgot-password UI instead. Both land on `GET /api/v1/auth/callback`,
  which exchanges the authorization code, verifies the ID token against the
  user pool's JWKS (`aws-jwt-verify`), and resolves it to an internal user.
  See [`docs/deployment/cognito-google-setup.md`](docs/deployment/cognito-google-setup.md)
  for the (manual, one-time) AWS/Google console setup this depends on.

Both providers converge on `findOrCreateUserByProviderIdentity`
(`packages/auth/src/identity-mapping.ts`) and the same `SessionManager`,
which issues an HttpOnly, opaque session cookie and resolves
`request.userId` on every request via a Fastify plugin
(`apps/api/src/plugins/session.ts`). Signing up with Google and later using
"Continue with email" with the same address (or vice versa) links to the
same account, based on a verified email match -- see the doc comment on
`findOrCreateUserByProviderIdentity` for the exact rule.

## Invite-only access and the admin panel

New account creation can be gated behind a real-world introduction instead
of being fully open:

- **Toggle.** `INVITE_ONLY_ACCESS` (env, default `false`) is the fallback;
  an admin can force it on, force it off, or clear the override entirely
  from `/app/admin`, without a deploy. `GET /api/v1/admin/settings` shows
  the environment default, the current override, and the effective value
  side by side.
- **Circle invites.** Any active Circle member -- not just coordinators --
  can create an invite link from the Circle detail page. The link is
  single-use (consumed the instant someone joins with it), expires after
  14 days, and can be revoked while still pending. There is no email
  sending yet: the inviter copies the one-time link shown at creation and
  sends it via email or text themselves.
- **Accepting an invite.** `/invite/:token` is a public page that previews
  the invite (Circle name, validity), then walks the invitee through
  sign-in/sign-up (carrying the token through Google/email OAuth or
  dev-auth) and joining -- with an existing station if they already have
  one, or by creating a new one in the same station wizard used everywhere
  else, which joins them to the Circle on successful creation.
- **Admins.** A platform-wide `isAdmin` flag on `users` (distinct from the
  per-Circle coordinator/member roles) gates `/app/admin` and every
  `/api/v1/admin/*` route. Every user that existed before this feature was
  grandfathered in as an admin, and the API refuses to demote the last
  remaining admin, so the app can never end up with zero admins.

See [ADR 13](docs/decisions/0013-invite-only-access-and-admin-panel.md) for
the full design rationale.

## Contact log (verified QSOs)

Any active Circle member can log that their station successfully talked to
another station in the same Circle:

- **Logging.** "Log a contact" is available from the top-level `/app/contacts`
  page and from the Circle detail page. The caller picks one of their own
  stations, the other (fellow Circle member) station, when it happened,
  the mode (simplex, repeater, satellite, or mesh), and optionally a
  channel, a 1-5 signal rating, and notes. Logging is one-sided and
  self-declared -- whoever logs it is the record, the same "declared
  outranks estimated" precedent as the repeater directory's RX/TX access
  declarations -- there's no mutual-confirmation step.
- **Feeds the connectivity analysis.** A logged contact between two
  stations upgrades that pair's Plan connectivity verdict to "Likely" and
  marks the link "Confirmed by contact," overriding the RF engine's own
  distance/gear estimate for that pair (see
  [ADR 14](docs/decisions/0014-contact-log-verified-qsos.md)).
- **Placement.** The top-level Contacts page lists every contact across the
  caller's own stations; the Circle detail page shows the five most recent
  Circle contacts plus the logging form; the station detail page shows a
  read-only recent-contacts card to the station's owner. Only the person
  who logged a contact can delete it.

See [ADR 14](docs/decisions/0014-contact-log-verified-qsos.md) for the full
design rationale.

## Circle Identifier

Every Circle has a permanent, human-readable public identifier -- a short
consonant-vowel-consonant-digit code like `RAV7`, shown prominently near the
Circle's name wherever the Circle appears in the UI, with a copy-to-clipboard
button. It's for display, verbal communication, and support use only:

- **Never a key.** The identifier is generated once, server-side, when a
  Circle is created, and is immutable afterward. It's exposed alongside the
  Circle's internal UUID in API responses, but routes, joins, and foreign
  keys always continue to use the UUID -- there's no "look up a Circle by its
  identifier" endpoint, and ordinary create/update requests can't set or
  change it.
- **Guaranteed unique** by a real Postgres unique index, with a bounded
  generate-and-retry loop on the rare collision.

See [ADR 15](docs/decisions/0015-circle-identifier.md) for the full design
rationale, including the staged migration and backfill approach for circles
that existed before this feature shipped.

## Tests

```bash
pnpm test          # runs the full Vitest suite once
pnpm test:watch    # watch mode
```

- **Unit tests** (`packages/domain`, `packages/database` schema shape,
  `apps/worker` job registry) have no external dependencies and always run.
- **API integration tests** (`apps/api/src/modules/**/*.test.ts`) exercise
  real HTTP requests against a real Fastify instance and a real PostgreSQL
  database (via `DATABASE_URL`) -- they require `docker compose up -d` to
  have been run first. Without a reachable database, these fail with
  connection errors; that is expected in an environment with no Docker
  installed (see [Known limitations](#known-limitations-of-this-milestone)).
- **Frontend component tests** (`apps/web/src/**/*.test.tsx`) use
  Testing Library + jsdom and mock the relevant `features/*/api.ts` hooks,
  so they never depend on a running API.

## Build

```bash
pnpm build
```

Builds every package, then `apps/api` and `apps/worker` (via `tsup`, into
`dist/index.js`, bundling workspace packages but leaving real npm
dependencies external) and `apps/web` (via `vite build`, into `dist/`).

## Deployment

See [`docs/deployment/deployment-runbook.md`](docs/deployment/deployment-runbook.md)
for the full runbook. Summary: this repo assumes an existing AWS setup --
Route 53, an Application Load Balancer, an EC2 Auto Scaling Group running
Nginx + systemd, RDS PostgreSQL, S3, SQS, Secrets Manager, and CloudWatch.
`infrastructure/` contains the Nginx site config, systemd unit files, and a
`deploy.sh` release script that builds in place from a git checkout on the
instance (there's no CI yet): `git pull` + `pnpm build` → copy into a new
release directory → migrate → swap symlink → restart services → reload
Nginx → poll `/health/ready` → sanity-check that Nginx is serving the
bundle that was just built. Operational access is via AWS Systems Manager
Session Manager, not SSH.

## Health endpoints

- `GET /health/live` -- returns `200` as soon as the process is up; no
  dependency checks. Suitable for a fast liveness probe.
- `GET /health/ready` -- additionally pings the database and returns `503`
  if it's unreachable. Suitable for an ALB target-group health check when
  you want "database is reachable" to gate traffic.

## Known limitations of this milestone

- **No Docker in this development environment.** The API's integration
  test suite and `apps/api`'s local `dev` script require a reachable
  PostgreSQL instance. Docker Desktop was not installed automatically
  (it requires a reboot for WSL2 and interactive license acceptance); see
  [`docs/deployment/local-toolchain.md`](docs/deployment/local-toolchain.md)
  for manual setup steps. Once Docker is running, `pnpm test` and
  `pnpm --filter @readycircle/api run dev` work as described above.
- **Apple sign-in and passwordless email are not implemented.** Cognito is
  configured with Google + native email/password only; `'apple'` remains a
  forward-compatible value in the `authProvider` contract but has no
  working sign-in path. A magic-link/OTP email option was considered and
  deliberately deferred in favor of Cognito's native password flow (less
  infrastructure to build and operate for the same v1 scope).
- **Station location has a map-based picker; Circle location does not yet.**
  Stations use a Leaflet + OpenStreetMap map (click-to-select a 1km MGRS
  cell, or drop a precise pin) or a geocoded zip/city/county/state search,
  with the server always deriving a canonical MGRS grid code from whatever
  coordinates are on file (see
  [ADR 9](docs/decisions/0009-mgrs-location-capture.md)). Radio Circles
  still use a plain free-text area/grid field, since this milestone's scope
  was stations only.
- **No equipment inventory yet.** The station detail page's Equipment card
  is still a "coming in a future milestone" placeholder. (Plans, Nets, and
  the contact log shipped -- see
  [ADR 10](docs/decisions/0010-hybrid-ai-plan-generation.md),
  [ADR 11](docs/decisions/0011-nets-computed-occurrences.md), and
  [ADR 14](docs/decisions/0014-contact-log-verified-qsos.md).)
- **The contact log is successes-only and Circle-scoped.** There is no
  "attempted but failed" tracking, and both sides of a contact must already
  be stations in one of the logger's own Circles -- no free-text "callsign
  I heard" entry (see
  [ADR 14](docs/decisions/0014-contact-log-verified-qsos.md)).
- **Net reminders are not sent.** The nets feature (scheduled check-ins,
  session logs, participation stats) is live, but the reminder hook is a
  no-op stub -- the SES-backed scheduled reminder job is deferred until
  email sending exists (see
  [ADR 11](docs/decisions/0011-nets-computed-occurrences.md)).
- **Plan documents are PDF-only.** The `plan_documents` table and job
  payloads support an `html` format value, but only `pdf` rendering is
  implemented.
- **Connectivity verdicts use conservative heuristics, not propagation
  modeling.** The RF reachability engine estimates range from antenna
  heights, TX power, and a terrain-class multiplier -- it does not consult
  elevation data, so a ridge between two stations won't be detected. An
  elevation-profile check is the documented follow-up (see
  [ADR 12](docs/decisions/0012-repeaters-gear-check-scenarios.md)).
- **RepeaterBook import requires an app token.** Without
  `REPEATERBOOK_APP_TOKEN`, the "Find repeaters near this Circle" flow
  reports "not configured"; manual repeater entry always works. myGMRS has
  no public API, so RepeaterBook (which serves both ham and GMRS) is the
  single external source (see
  [ADR 12](docs/decisions/0012-repeaters-gear-check-scenarios.md)).
- Spec section 27 (explicitly out of scope) was not implemented.

## Next milestone

The natural next slice of work, building on this foundation:

1. Complete the AWS/Google console setup in
   [`docs/deployment/cognito-google-setup.md`](docs/deployment/cognito-google-setup.md)
   and do a real end-to-end sign-in test against a live Cognito user pool.
2. Bring the same map-based location picker (see
   [ADR 9](docs/decisions/0009-mgrs-location-capture.md)) to the Circle
   wizard, replacing its remaining free-text area/grid fields.
   Also: build the "find nearby stations" feature on top of the
   `findNearbyStations` groundwork already in place
   (`apps/api/src/modules/stations/nearby.ts`).
3. Set up SES email sending and turn the `NetReminderService` stub into a
   scheduled worker job (`net.reminder`) that reminds members before each
   computed net occurrence.
4. Add equipment inventory to the station detail page.
5. Add Apple sign-in as a second Cognito federated identity provider.
