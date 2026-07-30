# ReadyCircle.net

ReadyCircle helps families, neighbors, churches, workplaces, and radio
operators build a local communications plan *before* they need it. People
register their **stations** (a radio setup -- handheld, home base, vehicle,
or organization facility), group stations into a **Radio Circle** (a
neighborhood, family, or organization group that communicates together),
and -- in a future milestone -- generate a shared plan for staying in touch
when cellular, internet, or power service goes down. This repository is the
initial application foundation: a public landing page, an authenticated app
shell, station and Radio Circle management, and the backend/infrastructure
scaffolding those features run on.

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
  registered job handlers (currently placeholders for plan/document
  generation). Runs independently of the API so slow/queued work never
  blocks HTTP requests.
- **`packages/contracts`** -- Zod schemas + inferred TypeScript types
  shared by the API and the web app, so request/response shapes can never
  drift between frontend and backend.
- **`packages/domain`** -- pure business rules (authorization predicates,
  visibility shaping) with no I/O, so they're trivial to unit test.
- **`packages/database`** -- Drizzle ORM schema, migrations, and seed data.
- **`packages/auth`** -- session management plus two interchangeable
  `AuthProvider` implementations: a development provider (cookie-based,
  no password) and a Cognito stub for production.
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
  observability/Structured logging + request IDs
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
| `AWS_REGION`, `AWS_S3_DOCUMENT_BUCKET`, `AWS_SQS_PLAN_QUEUE_URL`, `AWS_SQS_DOCUMENT_QUEUE_URL` | Required in production; the worker idles (with a warning) if a queue URL is unset, which is expected in local development. |
| `COGNITO_*` | Production identity provider config; not required in development. |

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

`packages/auth` defines an `AuthProvider` interface with two
implementations:

- **`DevAuthProvider`** -- only registered when `DEV_AUTH_ENABLED=true` and
  `APP_ENV` is not `production` (see the guard above). Lets you sign in as
  any seeded or newly-created user with no password, for fast local
  iteration and tests.
- **`CognitoAuthProvider`** -- a stub implementing the same interface for
  AWS Cognito (OAuth redirect/callback, session mapping). Wiring this up to
  real Cognito credentials is out of scope for this milestone; the
  interface exists so the API code that depends on "an authenticated user"
  never has to know which provider is behind it.

Both providers converge on the same `SessionManager`, which issues an
HttpOnly, signed session cookie and resolves `request.userId` on every
request via a Fastify plugin (`apps/api/src/plugins/session.ts`).

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
`deploy.sh` release script (extract → install prod deps → migrate → swap
symlink → restart services → reload Nginx → poll `/health/ready`).
Operational access is via AWS Systems Manager Session Manager, not SSH.

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
- **Cognito is a stub.** `CognitoAuthProvider` implements the `AuthProvider`
  interface but is not wired up to real AWS Cognito credentials or an OAuth
  redirect flow.
- **Plan and document generation are placeholders.** `apps/worker`'s job
  handlers validate their message payloads and log receipt, but do not
  generate any real content -- no AI-assisted drafting, no PDF rendering.
- **No map-based location picker.** Station and Circle location entry uses
  plain text/number fields today; the data model (precision levels, grid
  identifiers, generalized area labels) is shaped so a MapLibre-based
  boundary picker can be added later without a schema change.
- **No equipment inventory, plans, nets, or contacts UI yet.** These are
  visible as "coming in a future milestone" placeholders in the app shell.
- Spec section 27 (explicitly out of scope) was not implemented.

## Next milestone

The natural next slice of work, building on this foundation:

1. Wire up `CognitoAuthProvider` to real AWS Cognito (user pool, OAuth
   redirect/callback, token verification) so production sign-in works
   alongside development auth.
2. Add a MapLibre-based boundary/location picker to the station and Circle
   wizards, replacing the manual lat/lng entry.
3. Implement real plan generation: assemble a Circle's stations, member
   roles, and capabilities into a structured plan, persist plan versions
   (immutable once published), and render a document via the worker
   (`apps/worker`'s `document.generate` handler) with S3 upload.
4. Build the Plans, Nets, and Contacts surfaces in `apps/web` that are
   currently "coming soon" placeholders.
5. Add equipment inventory to the station detail page.
