# 18. Repeater enrichment: location UX, contact FK, and access checks

## Status

Accepted

## Context

Circle repeaters ([0012](0012-repeaters-gear-check-scenarios.md)) are shared
infrastructure, not stations. Manual adds often lacked coordinates even
though the schema and RF engine already support them, so coverage estimates
for non-imported machines were weak. Contacts ([0014](0014-contact-log-verified-qsos.md))
could set `mode: 'repeater'` without naming which directory machine was
used. Members also needed a way to record “I got into this repeater /
talked to someone not in the Circle” without inventing fake counterparty
stations.

## Decision

- **Repeaters stay Circle directory rows.** No `stationType=repeater`.
- **Optional map location on create/edit** (reuse the station precise map
  picker + place search). Coords are strongly prompted but not required.
- **Optional `contacts.repeater_id`** when `mode` is `'repeater'`; the
  repeater must belong to the contact’s Circle. Plan-gen passes the name
  through so confirmed links can label `viaRepeaterName` with that machine.
- **New `repeater_checks` table** for station→repeater observed access
  (`rx` / `rx_tx`), with optional free-text `counterpartyNote`. Logging a
  check upserts `station_repeaters` (`rx_tx` wins over `rx`). Deleting a
  check does **not** remove the declared link — checks are history; the
  station owner clears access from the station edit card.

## Consequences

- Manual and imported repeaters can both participate in distance-based RF
  estimates once located.
- Station↔station QSOs via a named repeater stay in `contacts`;
  “someone unspecified on this machine” stays in `repeater_checks`.
- Declared access remains the RF engine’s primary observed-truth input for
  repeater paths; checks keep that table current as a side effect.
