# 17. APRS live station tracking via a persistent APRS-IS listener

## Status

Accepted

## Context

Many amateur radio stations already beacon their position over APRS
(Automatic Packet Reporting System), which digipeaters relay and APRS-IS
(the internet backbone that aggregates APRS traffic) makes available
publicly. Members asked whether ReadyCircle could show these positions on
a live map without requiring any new hardware or manual check-ins. Two
ingestion approaches were considered:

- **Polling a public aggregator (e.g. `aprs.fi`)** per configured
  callsign. Simple to call from the API, but rate-limited to roughly one
  request per callsign per minute and requires an API key; polling cadence
  would also lag "live" noticeably for a Circle with several stations.
- **A persistent APRS-IS TCP listener inside `apps/worker`.** `apps/worker`
  is already a long-running systemd process built around a `run()`/`stop()`
  poller pattern (`QueuePoller`, see `apps/worker/src/queue-poller.ts`), so
  an always-on socket that logs in once and receives a live stream fits its
  existing shape without a new deployment model. It also sidesteps the
  aggregator's rate limit and key requirement entirely.

The persistent listener was chosen for actually-live updates and to avoid
depending on a third-party rate limit for a feature meant to feel
real-time.

Stations had no existing way to identify themselves over APRS: only
`repeaters` had a `callsign` field. A new optional `stations.callsign`
column was required purely to match heard packets to a station -- it is
not otherwise validated for uniqueness (SSIDs like `-9` or `-5` make
legitimate bare-callsign collisions possible, and the match key is always
the full string including any `-SSID`).

## Decision

- **New `packages/aprs` package**, mirroring `packages/geo`'s shape (pure
  logic, no I/O, fully unit-tested): `parseAprsPosition` parses one
  TNC2-format line, and `buildAprsIsFilter` builds the `b/CALL1/CALL2/...`
  budlist filter APRS-IS expects.
- **v1 scope is uncompressed position reports only** (payload types `!`,
  `=`, `@`, `/`). Base91-compressed positions -- common on modern trackers
  -- are not decoded; `parseAprsPosition` returns `null` for them, the same
  as for message/telemetry/object/weather packets and server comment
  lines. This was flagged as a possible scope trade-off during planning
  and confirmed during implementation: decoding both formats in v1 would
  have roughly doubled the parser's surface area for a format that's
  simply absent from older/simpler trackers, and callsigns that only ever
  send compressed positions will just never appear on the live map rather
  than showing a wrong one.
- **`/`-type (local time) timestamps are treated as unparseable.** APRS's
  `/` timestamp format has no timezone information, so it cannot be
  reliably converted to UTC; `parseAprsPosition` returns `null` for a
  packet whose only timestamp is in that format, and the listener falls
  back to the packet's receipt time (`heardAt`) instead of inventing an
  incorrect one.
- **Persistent listener in `apps/worker`** (`AprsIsListener`, socket-based,
  mirrors `QueuePoller`'s `run()`/`stop()` lifecycle and catch-sleep-continue
  reconnect loop): connects to APRS-IS, logs in with a budlist filter
  scoped to the Circle members' configured callsigns, and periodically
  (every 5 minutes, `filterRefreshIntervalMs`) re-queries the DB and pushes
  an updated `#filter ...` line on the live connection if the callsign list
  changed -- no reconnect required, per the APRS-IS protocol. Reconnects
  with exponential backoff on socket error/close. `apps/worker/src/index.ts`
  unifies this listener and the existing SQS `QueuePoller`s under a common
  `Runnable` interface so both share one shutdown path.
- **Off by default, gated on a login callsign.** New env vars
  `APRS_IS_HOST` (default `rotate.aprs2.net`), `APRS_IS_PORT` (default
  `14580`), `APRS_IS_CALLSIGN` (default empty), `APRS_IS_PASSCODE` (default
  `-1`, receive-only). The worker only starts the listener when
  `APRS_IS_CALLSIGN` is set, logging a warning otherwise -- the same
  pattern already used for "no queue URL configured, skipping poller."
  `PASSCODE=-1` is intentional: this feature only ever receives from
  APRS-IS, never transmits.
- **Privacy: no precision gating on APRS-derived positions.** Unlike a
  station's manually-set location (`stationLocations.precision`, which
  hides exact coordinates from non-owners -- see
  `packages/domain/src/station-visibility.ts`), every active Circle member
  sees a station's exact APRS-derived coordinates once it has one, with no
  redaction. Reasoning: an APRS beacon is already public over RF and on
  `aprs.fi`/`findu.com`; gating it inside ReadyCircle wouldn't add real
  protection and would just make the in-app map wrong or confusing
  relative to what's already public. The manual `precision` setting
  remains a separate, deliberate privacy control for a station's
  *declared* home location -- a different concept from "I am currently
  choosing to beacon my live position over RF." `aprsPositionResponseSchema`
  documents this explicitly.
- **New `station_aprs_positions` table**, one upserted row per station
  (mirrors `stationLocations`'s shape): `stationId` (PK/FK, cascade),
  denormalized `sourceCallsign`, `latitude`/`longitude`, a `geog
  geography(Point,4326)` column with a GIST index (same pattern as
  `station_locations.geog` and `circles.grid_geog` -- groundwork for a
  future "stations/circles near me" query, not used by any query yet),
  `symbolTable`/`symbolCode`, an optional `comment`, `heardAt`, and the raw
  packet text for debugging.
- **New read-only endpoint** `GET /api/v1/circles/:circleId/aprs-positions`,
  gated the same way as repeaters/contacts (must be an active Circle
  member), returning the latest position for every member station that has
  both a configured `callsign` and a recorded position.
- **Frontend**: an optional "Callsign" field on the station wizard/edit
  forms (purely for APRS matching, no other effect), and a new
  `CircleLiveMap` card on the Circle page -- a read-only Leaflet map (reusing
  the existing map setup from `MapLocationPicker`) with one marker per
  reporting station, auto-fit bounds, a popup with station name/callsign/
  comment/"heard X ago", and a muted marker style once a position is older
  than a 2-hour staleness threshold. Polls the endpoint every 60 seconds to
  read as "live" without needing a push channel.

## Consequences

- A station only appears on the live map once it has both a configured
  callsign *and* has actually been heard beaconing on APRS-IS since the
  worker last restarted (or since the callsign was added, thanks to the
  periodic filter refresh) -- there is no seed/backfill from historical
  APRS-IS traffic.
- Stations that only ever transmit Base91-compressed positions won't
  appear until compressed-format decoding is added; this is a known,
  intentionally deferred limitation rather than a bug.
- The `geog`/GIST index on `station_aprs_positions` is unused by any route
  today, matching the same "add the column now, build the query later"
  precedent as `circles.grid_geog` (ADR 16) and `station_locations.geog`
  (ADR 9).
- No Contact Log integration: an APRS "heard" position is a distinct
  concept from a verified two-way QSO (ADR 14) and the two are not linked.
- As with other Leaflet-based components, `CircleLiveMap.test.tsx` avoids
  asserting on `Popup` content without first opening it (JSDOM only mounts
  popup content into the DOM once Leaflet opens it), and checks marker
  count/opacity directly rather than relying on visual rendering.
