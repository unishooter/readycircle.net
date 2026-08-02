# 11. Nets with computed occurrences and logged sessions

## Status

Accepted

## Context

A net is a recurring scheduled on-air check-in for a Radio Circle -- the
practice habit that makes a communications plan actually work when it's
needed. The feature has to answer three questions: when is the next net,
who showed up to past nets, and who is falling out of the habit. It also
needs to close the loop with plan generation: a published plan already
proposes a check-in schedule and a channel plan, so creating a net from a
plan should be one click, not re-typing.

Two modeling questions dominated the design:

1. **Are future occurrences rows or computations?** Materializing
   occurrence rows (like calendar systems often do) requires a scheduler to
   extend the horizon, invalidation when the rule changes, and cleanup of
   never-run occurrences.
2. **How do reminders fit** when the platform has no scheduler and no email
   sending (SES) wired up yet?

## Decision

- **Occurrences are computed, never stored.** `nets` rows hold only the
  recurrence rule (`frequency` weekly/biweekly/monthly, a `first_occurs_on`
  anchor date, a local wall-clock `time_local`, and an IANA `timezone`).
  `nextOccurrences(rule, from, count)` in `packages/domain` derives
  upcoming UTC instants on demand using only `Intl` timezone math (no new
  dependencies) -- DST-aware, so a 19:00 net stays at 19:00 local across
  transitions. Monthly recurrence means the anchor's nth-weekday-of-month,
  clamped to the last occurrence in months without an nth. Editing the rule
  automatically "reschedules" everything because nothing was materialized.
- **Only sessions that ran are rows.** `net_sessions` records an occurrence
  someone actually opened (open/closed/cancelled, optional net-control
  station, notes); `net_checkins` records which stations participated, with
  a unique `(session_id, station_id)` constraint making duplicates a 409 at
  the API layer.
- **Authorization mirrors Circle roles plus one capability flag.**
  Coordinators manage nets (create/edit/archive). Opening/closing sessions
  and recording *any* station's check-in additionally extends to members
  who own an active station in the Circle flagged
  `willingToActAsNetControl` -- the flag stations have declared since the
  station wizard shipped. Any member may record (or undo) a check-in for a
  station they own.
- **Stats are derived from closed sessions at read time**: all-time
  attendance count, attendance rate over the last 10 closed sessions, and
  current consecutive-session streak, computed in the service from the
  session/check-in rows (session counts per net are small; no
  materialized aggregates).
- **Plan prefill is best-effort and client-side.** "Create from published
  plan" parses the plan's free-text `check_in_schedule`
  (`cadence`/`dayAndTime`) and the channel plan's primary entry into form
  defaults the coordinator reviews before saving; `source_plan_version_id`
  records provenance. Unparsable text simply leaves fields blank -- the
  human confirms everything, so loose parsing is acceptable.
- **Reminders are a stub.** `NetReminderService` in the API is an interface
  with a single no-op logging implementation, called where a "session
  opened" notification belongs. The production shape -- a scheduled worker
  job type (`net.reminder`) that emails members via SES ahead of computed
  occurrences -- is deliberately deferred until SES sending exists.

## Consequences

- No scheduler, no occurrence-extension job, and no stale-occurrence
  cleanup; the price is that "next occurrence" must be computed on every
  read (three occurrences per net on list endpoints -- cheap).
- Timezone math lives in one tested module; anything else that later needs
  recurrence (reminders, dashboards, iCal export) reuses it.
- Because check-ins reference stations (not users), participation history
  survives membership changes and matches the product's station-centric
  model; a station leaving the Circle keeps its past attendance visible in
  stats.
- The reminder stub means members must notice the schedule themselves for
  now; the interface seam makes the SES job a additive change (worker
  handler + scheduler) rather than an API refactor.
