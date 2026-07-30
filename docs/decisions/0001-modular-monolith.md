# 1. Modular monolith over microservices

## Status

Accepted

## Context

ReadyCircle's core domain (users, stations, Radio Circles, memberships,
plans) is small, tightly coupled, and mostly transactional -- e.g. creating
a Circle must atomically assign its creator as coordinator, and archiving a
station shouldn't leave dangling memberships. The product also has exactly
one team building it at this stage, with no independent scaling or
independent-deployment requirements yet.

## Decision

Ship a **modular monolith**: a single Fastify API process and a single
worker process, each organized internally into feature modules
(`modules/stations`, `modules/circles`, `modules/memberships`, ...) with
their own routes, services, and repositories, all sharing one PostgreSQL
database. Modules depend on shared packages (`contracts`, `domain`,
`database`) rather than calling each other's internals directly, so the
boundaries that would matter for a future service split already exist in
the code, even though there's only one deployable API artifact today.

## Consequences

- Multi-table operations (Circle creation + coordinator assignment,
  membership changes + audit logging) can use a single database
  transaction instead of a distributed-transaction or saga pattern.
- Deployment is simpler: one API systemd unit, one worker systemd unit, one
  RDS database, no service mesh or inter-service auth to design yet.
- If a module later needs independent scaling (e.g. plan generation under
  heavy load), the existing module boundary makes it straightforward to
  extract -- but that extraction is deliberately deferred until there's a
  concrete reason for it.
- All modules currently share one failure domain: an unhandled exception in
  one module's route can, in principle, affect the whole API process. This
  is mitigated by consistent error handling (`plugins/error-handler.ts`) and
  Zod validation at every route boundary.
