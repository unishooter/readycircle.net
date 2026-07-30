# 5. Immutable, versioned published plans

## Status

Accepted (schema in place; generation logic not yet implemented)

## Context

A Radio Circle's communications plan is meant to be printed, laminated, and
kept in a go-bag -- something people can trust to be internally consistent
during an actual emergency. If a plan could be edited in place after
publication, someone could be relying on a physical copy of page 3 while
page 1 has since changed underneath it, or a coordinator could be looking
at a half-updated plan mid-edit during a live outage.

## Decision

Model plans as `plans` (the logical, ongoing plan for a Circle) with
`plan_versions` (immutable snapshots) and `plan_sections` (structured
content within a version), per the schema in
`packages/database/src/schema/plans.ts`. Once a `plan_versions` row is
published, its content is never mutated -- generating an updated plan
creates a *new* version rather than editing the existing one. "Current
plan" always means "the latest published version," and every rendered
document (PDF/HTML, produced by the worker's `document.generate` handler)
is generated from exactly one immutable version.

## Consequences

- A printed/downloaded plan document can always be traced back to a
  specific, unchanging version -- there's no ambiguity about "which
  version of the plan is this piece of paper."
- Regenerating a plan (e.g. after a station is added to the Circle) is an
  additive operation (new version row) rather than a destructive update,
  which also gives a natural audit trail of how a Circle's plan evolved.
- Storage grows with every regeneration rather than staying constant; this
  is an acceptable tradeoff given plans are expected to be regenerated
  infrequently (not on every minor Circle change) and plan/document rows
  are small relative to the documents themselves (which live in S3, not
  the database).
- This decision only concerns the data model. Actual plan-content
  generation (assembling stations/roles/capabilities into plan sections)
  is out of scope for this milestone -- see the worker's placeholder
  `plan.generate` handler.
