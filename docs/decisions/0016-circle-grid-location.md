# 16. Circle map-based grid location, reusing the station MGRS pattern

## Status

Accepted

## Context

Circles previously captured their location as two free-text fields: a
required `areaLabel` ("a neighborhood, town, or region name") and an
optional `gridOrLocalityLabel` ("a grid square or locality name") that a
coordinator typed by hand. Nothing validated the latter's format or tied it
to real coordinates, so it couldn't power any location-based feature (e.g.
a future "find open Circles near my ZIP code or city" search) -- it was
purely decorative text. Stations had already solved the equivalent problem
(see [ADR 0009](0009-mgrs-location-capture.md)): a map picker that snaps
clicks to a 1km MGRS cell, with the server always deriving the canonical
grid code from coordinates rather than trusting client-supplied text. This
feature applies that same pattern to Circles.

## Decision

- **The free-text grid/locality input is removed from the Circle
  create/edit forms; a map click is the only way to set it going
  forward.** `apps/web/src/features/location/MapLocationPicker.tsx` (`mode="grid"`)
  is reused unchanged in both `CircleWizardPage` and `CircleEditPage`,
  identically to how `StationLocationSection` already uses it. Explicit
  instructional copy next to the picker states that this places a pin at
  the center of the Circle's general area, does *not* represent its actual
  coverage, and will help future features (e.g. finding open Circles near a
  ZIP code or city) surface this one.
- **The server always re-derives the grid identifier from coordinates,
  never trusting a client-supplied value.** `circleGridLocationInputSchema`
  (`packages/contracts/src/circle.ts`) only accepts `{ latitude, longitude
  }`; `apps/api/src/modules/circles/repository.ts` calls
  `deriveGridIdentifier` (`@readycircle/geo`, the same function stations
  use) inside `createCircleRecord`/`updateCircleRecord`. An explicit `null`
  for `area.gridLocation` clears an existing pin; `undefined`/omitted
  leaves it untouched -- the same tri-state convention already used for the
  optional contact-email/address fields.
- **PostGIS geography is added now, even though "find Circles near me" is
  a future feature.** `circles` gains `grid_identifier`, `grid_latitude`,
  `grid_longitude`, and a `grid_geog geography(Point,4326)` column plus a
  GIST index (`circles_grid_geog_idx`), mirroring `station_locations`
  exactly. `upsertCircleGeography` in the repository writes it via raw SQL
  (`ST_SetSRID(ST_MakePoint(...))::geography`), the same pattern as
  `upsertGeography` in the repeaters repository. This is deliberately ahead
  of need: adding the column and index alongside the picker UI costs
  nothing extra today and avoids a second migration once the actual nearby-
  search feature is built.
- **Legacy free-text values are kept as a display fallback, with no
  backfill attempted.** `gridOrLocalityLabel` (the pre-existing
  `grid_or_locality_label` column) is left in place and still returned by
  the API, but the field is no longer settable through create/update --
  there's no reliable way to turn arbitrary historical free text (e.g.
  seed data's `"FN20"`) into real coordinates. `CircleDetailPage` shows the
  new server-derived `gridIdentifier` when present, falling back to the
  legacy label only if no pin has ever been set; `CircleEditPage` shows a
  small note ("Previously recorded: FN20 (free text, not shown on a map).
  Set a location above to replace this.") under the same condition. As soon
  as a coordinator sets a real pin, the legacy label stops being shown
  anywhere and the new `gridIdentifier` takes over permanently.
- **No extra visibility gating.** Unlike per-station precision-based
  redaction, the field is returned in the standard `circleResponseSchema`
  with no privacy shaping -- whatever can already see a Circle's data (its
  members) can see this too.

## Consequences

- Circles created before this feature keep showing their legacy free-text
  label (if any) until a coordinator re-saves with a map pin; there is no
  migration step that invents coordinates for old rows.
- `apps/api` already depended on `@readycircle/geo` (for stations), so no
  new package dependency was needed -- only the `deriveGridIdentifier` call
  site is new.
- As with `MapLocationPicker` generally (see ADR 0009's consequences), deep
  Leaflet interaction testing is impractical under JSDOM once a value with
  an `mgrsCode` is set (it renders a `<Rectangle>` cell highlight, which
  needs a vector renderer JSDOM doesn't support). `CircleWizardPage.test.tsx`
  and `CircleEditPage.test.tsx` cover the surrounding behavior (instructional
  copy, Clear-location button, legacy-fallback note, and payload shape) by
  mocking `MapLocationPicker` with a simple button that simulates a
  click-to-select, rather than exercising the real map.
- The new `grid_geog`/GIST index groundwork is unused by any route or UI
  today -- like the equivalent station groundwork in ADR 0009, it only
  needs to exist and be queryable once the actual nearby-Circle-search
  feature is built.
