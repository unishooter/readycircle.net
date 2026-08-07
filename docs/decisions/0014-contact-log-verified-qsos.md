# 14. Contact log (verified QSOs) confirms RF reachability

## Status

Accepted

## Context

The RF reachability engine ([0012](0012-repeaters-gear-check-scenarios.md))
only ever estimates connectivity from declared gear, distance, and terrain --
it has no way to know that two stations have actually talked to each other
on the air. Meanwhile there was no way for a Circle to record that a QSO
("contact") happened at all: Nets ([0011](0011-nets-computed-occurrences.md))
track *attendance* at a scheduled check-in, not *who successfully reached
whom*, and the two are genuinely different facts -- a station can check into
a net without confirming a two-way contact with any specific other station,
and a contact can happen entirely outside of a net. The product needed a
lightweight way to log a verified QSO and have it feed back into the same
connectivity analysis that Plans already show, so a Circle's confidence in
its own coverage map improves every time members actually get on the air
together.

## Decision

- **A contact is a new first-class record, not a Net check-in field.**
  `contacts` (`packages/database/src/schema/contacts.ts`) is its own table --
  `circleId`, `stationId` (the logging/"my" station), `counterpartyStationId`,
  `occurredAt`, `mode`, `channel`, `signalRating` (1-5), `notes`, an optional
  `netSessionId` for provenance when the QSO happened during a net, and
  `recordedByUserId`. Keeping it separate from `net_checkins` means a contact
  never requires an open net session, and a net check-in never implies a
  specific confirmed pairing.
- **One-sided, self-declared, same as repeater access.** Whoever logs the
  contact is the record -- there is no mutual-confirmation workflow, request,
  or acceptance step. This mirrors the existing `station_repeaters`
  "declared = observed truth outranks the estimate" pattern
  ([0012](0012-repeaters-gear-check-scenarios.md)) rather than inventing a new
  two-party confirmation flow for v1. `canLogContact` in
  `packages/domain/src/circle-authorization.ts` only requires active Circle
  membership; a separate, stricter check at the API layer
  (`apps/api/src/modules/contacts/service.ts`) requires the caller to *own*
  `stationId` and requires both `stationId` and `counterpartyStationId` to be
  active member stations of the same Circle. There is no free-text
  "callsign I heard" field in v1 -- both sides of a contact must already be
  stations in one of the caller's own Circles.
- **Successes only; no failed-attempt tracking.** The schema and API have no
  concept of a "we tried and couldn't reach them" record. This keeps the
  model simple and matches the actual use case (a coverage-confidence log),
  at the cost of not being able to show "attempted but marginal" data --
  that's a possible v2 extension if it turns out to matter.
- **A confirmed contact overrides the RF engine's own verdict, not just
  nudges it.** `analyzeRfReachability`
  (`packages/domain/src/rf-reachability.ts`) now accepts
  `confirmedContacts: RfConfirmedContact[]`. For any station pair with a
  logged contact, the pair's `verdict` is forced to `'likely'`, `pathType`
  is set to the contact's declared `mode` (not necessarily the estimate's
  best-guess path), and the resulting `ConnectivityLink.confirmed` flag is
  set to `true` so the UI (`PlanSections.tsx`) can render a distinct
  "Confirmed by contact" badge alongside the verdict badge, rather than
  conflating "confirmed" with "estimated likely." When multiple contacts
  exist for the same unordered pair, the most recent `occurredAt` wins --
  gear and conditions change, so a fresh contact is a better signal than an
  old one. `packages/plan-engine/src/context.ts` queries `contacts` for the
  gathered station IDs alongside the existing `station_repeaters` query and
  maps rows to `RfConfirmedContact[]` before calling the engine, so every
  Plan generation automatically benefits without any per-Plan configuration.
- **Placement mirrors the repeater directory: a top-level page plus
  Circle/station widgets, not a wizard.** `/app/contacts`
  (`ContactsPage.tsx`) lists every contact across the caller's own stations
  and Circles with an inline "log a contact" form (pick a Circle first, then
  the two stations); `CircleContactsCard` on the Circle detail page shows
  the five most recent Circle contacts plus the same logging form scoped to
  that Circle; `StationDetailPage` gets a read-only recent-contacts card,
  gated on `station.isOwner` since read access mirrors log access (only the
  owner can `GET /stations/:stationId/contacts`).

## Consequences

- Plans now distinguish "the RF math thinks this link is likely" from "two
  stations already proved it in real life," which is a stronger and more
  trustworthy signal for exactly the coverage gaps the app exists to
  surface -- and it costs the Circle nothing extra: logging a contact is a
  side effect of something hams already want to record for their own
  logbook purposes.
- Because confirmation is one-sided, a contact log can theoretically be
  logged inaccurately (by mistake or, in principle, dishonestly) with no
  counterparty pushback built in. This is an accepted tradeoff for v1
  simplicity, consistent with the same tradeoff already made for repeater
  access declarations; a future iteration could add lightweight
  counterparty acknowledgement without changing the underlying schema (the
  `recordedByUserId` / one-row-per-declaration shape already supports it).
- Deleting a contact is restricted to whoever logged it (`recordedByUserId
  === caller`), not Circle coordinators -- consistent with "the logger is
  the record," but it does mean a coordinator can't clean up a clearly
  mistaken entry logged by someone else without that member's cooperation.
  This mirrors the same "no admin override" tradeoff already accepted for
  Circle invites in [0013](0013-invite-only-access-and-admin-panel.md).
- The new `contacts` table required a hand-written Drizzle migration and
  snapshot (same as [0013](0013-invite-only-access-and-admin-panel.md)),
  since `drizzle-kit generate` requires an interactive TTY that isn't
  available in this environment.
- Optional `contacts.repeater_id` and station→repeater access checks are
  covered in [0018](0018-repeater-enrichment-and-checks.md).
