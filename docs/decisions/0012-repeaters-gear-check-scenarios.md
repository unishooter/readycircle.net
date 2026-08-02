# 12. Repeater directory, RF gear check, and scenario-aware plans

## Status

Accepted

## Context

A communications plan is only as good as the RF reality underneath it: two
handhelds eight miles apart across a ridge will not talk to each other no
matter what channel the plan assigns. Three related needs surfaced
together:

1. **Repeaters.** Most real-world range in a Circle comes from local ham
   and GMRS repeaters, so the plan needs to know which repeaters exist
   near the Circle and which stations can actually hear (RX) or bring up
   (TX) each one.
2. **Gear check.** Circles want a "gear-up" answer: given where members
   are (including *planned* stations that have a location but no equipment
   yet), can at least one station relay messages to every edge station and
   back -- and if not, what generic gear closes the gap?
3. **Scenarios.** "72-hour local outage" and "multi-week regional
   disaster" call for different advice (backup power depth, satellite
   internet/phones, mesh networks), so the coordinator should pick the
   circumstances a plan version targets.

External data sourcing was researched first: **myGMRS has no public API**
(its data is account-gated), while RepeaterBook's export API serves both
ham and GMRS repeaters (`stype=gmrs`) from one endpoint, requiring a free
issued app token, a descriptive User-Agent, and cached (not repeated)
whole-state exports.

## Decision

- **Circle-scoped repeater directory, member-add / coordinator-curate.**
  `repeaters` rows belong to a Circle; any active member may add one
  (members are the ones who know what they can hear), while coordinators
  -- or the member who added the entry -- may edit, verify, or delete it.
  `station_repeaters` records per-station access as `rx` or `rx_tx`;
  declared links must reference repeaters in a Circle the station is an
  active member of.
- **One external integration: RepeaterBook, proxied server-side.**
  `GET /circles/:circleId/repeaters/import-search` mirrors the Nominatim
  proxy pattern (token + User-Agent stay on the server, 5 s rate gate,
  24 h in-memory cache per state + service). The state is derived by
  reverse-geocoding the Circle's station centroid (or passed explicitly);
  results are distance-filtered against the centroid and deduped against
  `external_id`. Import re-resolves selections server-side so clients
  cannot forge repeater data through the import path.
  `REPEATERBOOK_APP_TOKEN` is optional everywhere -- without it the import
  UI reports "not configured" and manual entry still works. Manual entry
  covers myGMRS-only repeaters.
- **Station RF attributes + hypothetical stations.** Stations gain
  optional `transmit_power_watts`, `antenna_type`, `antenna_height_feet`,
  and `backup_power`; station `status` gains `hypothetical` -- a planned
  station created from just a name and location, exactly so the gear
  check can plan around it. The wizard shortens to Identity → Location →
  Review for planned stations.
- **Deterministic RF reachability engine in `packages/domain`** (pure
  logic, no I/O): radio horizon from antenna heights (defaults by station
  type when unset), clamped by a conservative practical-range table keyed
  on band, TX power, and antenna class; pairwise simplex verdicts
  (`likely`/`marginal`/`unlikely`); repeater paths (both ends `rx_tx` on a
  shared repeater = likely, `rx`-only = one-way; estimated
  distance-to-repeater stands in for hypothetical stations with no
  links); plus satellite and mesh paths from capabilities. Graph analysis
  yields connected components, edge/isolated stations, single points of
  failure, and the **baseline relay test**: at least one station can
  (theoretically) relay to every edge station and back.
  **Terrain is a class multiplier only in this build** -- no elevation
  data. The engine is structured so a later elevation-API path profile
  drops in as a follow-up.
- **Scenario is coordinator input, stored per plan version.**
  `plan_versions.scenario` (jsonb) holds circumstances (power outage / no
  cellular / no internet), duration (72 h / week / weeks+), extent, and
  notes; presets cover the common cases and regeneration inherits the
  previous version's scenario unless overridden. Pre-scenario versions are
  treated as the 72-hour default preset.
- **Gear check extends the existing plan pipeline** rather than becoming
  a separate lifecycle: a new deterministic `connectivity` section
  (computed during a new `analyzing_connectivity` stage) and a new
  advisory `gear_recommendations` section, reusing the same jobs, PDF
  rendering, and publish flow. The advisory prompt assumes a
  UV-5R-class GMRS + dual-band HT as the baseline station, keys backup
  power / satellite / mesh advice to the scenario, and is constrained to
  generic gear classes ("50 W GMRS mobile with a base antenna at ~20 ft"),
  never brands or models. The `amateur` capability was relabeled "Amateur
  dual band (2m/70cm)" (label-only; no data migration) and comm-tech
  capability values (`satellite_internet`, `satellite_phone`,
  `meshtastic`, `meshcore`) were added additively.
- **Privacy discipline unchanged.** The engine consumes precise stored
  coordinates internally, but only rounded pairwise distances and
  verdicts enter the context snapshot, the AI prompt, and the rendered
  sections -- never coordinates. Stations without coordinates are flagged
  "location needed for coverage analysis" rather than guessed at.

## Consequences

- One RepeaterBook integration covers both services; there is no myGMRS
  dependency to operate, and Circles in areas RepeaterBook covers poorly
  fall back to manual entry with no loss of function.
- The RF verdicts are deliberately conservative heuristics, not
  propagation modeling: good enough to rank gaps and justify gear
  recommendations, and clearly labeled as estimates in the plan. The
  known accuracy ceiling is terrain -- adding an elevation-profile check
  (e.g. an open elevation API sampled along each link) is the documented
  follow-up and slots into the existing `terrain` seam in the engine.
- Because gear check rides the plan pipeline, every plan version now
  carries its scenario and connectivity facts immutably -- regenerating
  after buying gear or adding a repeater produces a comparable
  before/after record.
- The in-memory RepeaterBook cache resets on process restart and is
  per-instance; acceptable at current scale, and the 5 s gate keeps even
  a cold fleet within RepeaterBook's usage expectations.
