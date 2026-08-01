# 9. MGRS as the canonical geo-fence code, with a map-based capture UI

## Status

Accepted

## Context

Station location capture previously accepted a free-text "grid identifier"
string with no defined format and no relationship to the stored
coordinates -- there was no way to know what format a given value was in,
and nothing enforced that it actually matched `latitude`/`longitude`. There
was also no way to *pick* a location visually: users had to already know
their grid reference and type it in.

The goal is a location-capture flow good enough to support four outcomes at
once:

- A quick, low-friction way to say "here's roughly where I am" (broad area:
  zip/city/county/state).
- A map-based way to select an approximate 1km area without exposing an
  exact address (the existing `one_km_grid` display precision).
- A map-based way to select an exact point, for the existing-but-previously
  unreachable `precise_private` precision.
- A single, canonical, machine-parseable "geo fence code" per station,
  independent of what's shown to other users, that a future "find nearby
  stations" feature (or an AI/third-party API integration) can rely on
  without caring which precision the owner chose to display.

## Decision

- **MGRS (Military Grid Reference System)**, via the
  [`mgrs`](https://github.com/proj4js/mgrs) package (proj4 team, MIT, zero
  dependencies, identical behavior in the browser and in Node), is the
  canonical grid format, wrapped in a new `packages/geo`:
  - `deriveGridIdentifier(lat, lng)` -- 1km-precision (`accuracy=2`) MGRS
    code.
  - `mgrsCellBounds(code)` / `mgrsCellCenter(code)` -- for drawing the
    highlighted cell and for storing a cell-center coordinate.
- **The stored `gridIdentifier` is always server-derived from whatever
  coordinates are on file**, independent of the display `precision` chosen
  by the owner. `stationLocationInputSchema` no longer accepts a
  client-supplied `gridIdentifier` at all -- there is no free-text grid
  input anywhere in the product. The existing shaping logic in
  `packages/domain/src/station-visibility.ts` (grid shown to non-owners
  only when `precision === 'one_km_grid'`) needed no changes, since it only
  gates *display*, not storage -- every station gets a consistent geo-fence
  code regardless of what it chooses to show.
- **Map interaction is click-to-select-a-cell, not a full grid overlay.**
  Clicking anywhere in `MapLocationPicker`'s `grid` mode snaps to and
  highlights the single containing 1km MGRS cell; there's no rendering of
  the surrounding grid lines. This was a deliberate scope cut -- the two
  community Leaflet plugins for drawing an MGRS grid overlay are both
  thinly maintained, and a single highlighted cell is sufficient for
  "confirm the square you're in."
- **Grid mode stores the cell center, never the raw click point.** An
  imprecise click (someone's thumb landing a few meters off) would
  otherwise leak an unintended level of precision into a coordinate
  nominally representing a 1km-wide area. `precise` mode is the only path
  that stores an exact clicked/dropped-pin point, and is the only path that
  meaningfully populates the `precise_private` option.
- **Leaflet + `react-leaflet`, with OpenStreetMap raster tiles** (no API
  key) as the map stack -- avoids any new paid/keyed dependency for a
  first-milestone feature, at the cost of OSM's usage/branding
  requirements (satisfied via the required tile attribution).
- **Broad-area search proxies OpenStreetMap Nominatim through the API**
  (`GET /api/v1/geocoding/search`), rather than calling it directly from
  the browser: Nominatim's usage policy requires an identifying contact
  address and caps usage at ~1 request/second, both of which are easier to
  guarantee from one server-side process (a promise-queue-serialized
  throttle in `apps/api/src/modules/geocoding/nominatim-client.ts`) than to
  trust in a public JS bundle running once per browser tab. A failed or
  rate-limited upstream call degrades to an empty result set rather than
  surfacing an error, since this is a type-ahead convenience, not a
  critical path.
- **A GIST index on `station_locations.geog`**
  (`station_locations_geog_gist_idx`) plus a new `findNearbyStations`
  function (`apps/api/src/modules/stations/nearby.ts`, using
  `ST_DWithin`/`ST_Distance`) are groundwork for a future "find nearby"
  feature. Neither is wired to a route or any UI yet -- this milestone only
  needed the data to be queryable efficiently once that feature exists, not
  the feature itself.
- **A full station edit page** (`StationEditPage`, at
  `/app/stations/:stationId/edit`) was added alongside this work, since
  `PATCH /stations/:id` already existed with nothing calling it, and
  "change your location after the fact" needed a variable-precision editing
  surface anyway. It reuses the same per-section form components
  (`apps/web/src/features/stations/form-sections/`) as the creation wizard
  rather than duplicating field markup, showing every section at once
  instead of stepping through them sequentially.

## Consequences

- Existing `gridIdentifier` values written before this change (free text,
  no defined format) are left as-is in the database; they're only
  overwritten the next time a station's location is created or updated
  through the API, at which point the server-derived MGRS value replaces
  whatever was there.
- `packages/geo` has no dependency on `packages/contracts`, `packages/
  database`, or any other application package -- it's pure lat/lng &lt;-&gt;
  MGRS math, usable identically from `apps/api` (source of truth) and
  `apps/web` (client-side preview of the highlighted cell before submit).
- Deep interaction testing of the Leaflet map itself is impractical under
  JSDOM (no real layout/canvas support), so `MapLocationPicker`'s click-to-
  cell logic is factored out into a plain, fully unit-tested function
  (`computeGridSelection` in `apps/web/src/features/location/
  grid-selection.ts`) with no Leaflet/React import, and the component
  itself is covered only by typechecking, not a dedicated interaction test.
- `GEOCODING_CONTACT_EMAIL` is a new environment variable (defaults to a
  generic ReadyCircle address) rather than a required one -- geocoding
  search still works out of the box in development, but production should
  set a real monitored address per Nominatim's usage policy.
