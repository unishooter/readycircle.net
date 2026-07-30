# 2. PostgreSQL with PostGIS for station geography

## Status

Accepted

## Context

Stations have a location that must support several distinct display
precisions ("hidden", "broad area", "1km grid", "precise, visible only to
me") and, eventually, spatial queries (e.g. "stations within N km of a
Circle's generalized area", or clustering stations for map display). This
needs a real geographic data type, not just separate latitude/longitude
float columns, if spatial queries are ever going to be efficient or
correct (e.g. distance calculations that account for the Earth's
curvature).

## Decision

Use **PostgreSQL** as the single datastore for the whole application, with
the **PostGIS** extension enabled specifically for the
`stations.location` column, stored as `geography(Point, 4326)`. Every other
table uses ordinary relational columns (UUID primary keys, `timestamptz`
for all timestamps); PostGIS is scoped to the one column that actually
needs it rather than adopted as a general modeling paradigm.

## Consequences

- Local development requires a PostGIS-enabled Postgres image
  (`postgis/postgis:16-3.4-alpine` in `docker-compose.yml`) rather than
  plain `postgres`.
- Precise coordinates are stored once, and every API response shapes what's
  returned based on the station's configured precision and the requester's
  relationship to it (`packages/domain`'s visibility-shaping helpers) --
  the database always has the real point, but non-owners never receive it
  in a response, and it's redacted from log output
  (`packages/observability`'s log redaction paths include `*.latitude` /
  `*.longitude`).
- Future spatial features (distance-based Circle suggestions, map
  clustering) can use PostGIS functions (`ST_DWithin`, `ST_ClusterKMeans`,
  etc.) directly in Drizzle queries without a data migration.
- AWS RDS for PostgreSQL supports the PostGIS extension natively, so this
  doesn't require a different managed database product in production.
