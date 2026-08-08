# 19. Contact-time location snapshots for logged QSOs and repeater checks

## Status

Accepted

## Context

Stations move. A logged contact between two Circle stations previously only
recorded *who* talked and *when* / *how* -- RF reachability and plan
generation always measured distance from each station's current home
location ([0014](0014-contact-log-verified-qsos.md),
[0012](0012-repeaters-gear-check-scenarios.md)). That understates (or
misrepresents) a QSO that happened while someone was mobile. Repeater
checks ([0018](0018-repeater-enrichment.md)) had the same gap for the
logging station, and “who you heard” was free text only with no way to
point at a Circle station.

## Decision

- **Snapshot lat/lng on the contact/check row at log time.** `contacts`
  stores optional `station_*` and `counterparty_*` coordinates (plus
  `*_location_overridden` flags). `repeater_checks` stores the logging
  station snapshot the same way. Defaults come from `station_locations`
  when the client omits a value; an explicit map adjustment is flagged
  overridden. Plans/AI prefer these snapshots for confirmed-pair distance
  when both ends are present, otherwise fall back to current home coords.
- **Override UI reuses `MapLocationPicker` in `precise` mode** (same
  component as station edit’s precise path, [0009](0009-mgrs-location-capture.md)).
  Counterparty placement is self-declared (same one-sided model as 0014);
  non-owners never receive another station’s private home coords in the
  form -- the server still fills the default from the DB when omitted.
- **Repeater-check “who you heard”** may be a Circle `heard_station_id`
  and/or free-text `counterparty_note`. Selecting a station prefills the
  note; text remains editable. Checks are still not treated as confirmed
  QSOs in the RF engine in this change.

## Consequences

- Historical contact geometry survives home-location edits.
- Connectivity link details may include “~X km at contact time” when
  snapshots exist.
- A short migration (`0016_contact_time_locations`) adds columns only;
  no PostGIS on these rows in v1.
