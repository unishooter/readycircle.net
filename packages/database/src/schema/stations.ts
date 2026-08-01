import { boolean, customType, doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';

/**
 * Raw PostGIS geography column. Its value is written with a raw SQL
 * statement (ST_SetSRID(ST_MakePoint(...))) whenever latitude/longitude on
 * `station_locations` changes, and is not read back through Drizzle's typed
 * query API in this milestone -- it exists so production geospatial
 * queries (nearby search, radius filters) have a real column to build on
 * later without another migration.
 */
const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

/**
 * Station type / experience / authorization / capability values are plain
 * text validated by the Zod contracts at the API boundary rather than
 * Postgres enums, so the product vocabulary can grow without a migration
 * for every new option.
 */
export const stations = pgTable('stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  stationType: text('station_type').notNull(),
  status: text('status').notNull().default('active'),
  experienceLevel: text('experience_level'),
  authorization: text('authorization'),
  goals: text('goals')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  participatesInScheduledChecks: boolean('participates_in_scheduled_checks').notNull().default(false),
  willingToRelay: boolean('willing_to_relay').notNull().default(false),
  willingToActAsNetControl: boolean('willing_to_act_as_net_control').notNull().default(false),
  receiveOnly: boolean('receive_only').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Separated from `stations` so that stored location data (canonical point,
 * generalized label, grid identifier, precision, source) can evolve
 * independently, and so display precision is modeled distinctly from the
 * underlying stored coordinates.
 */
export const stationLocations = pgTable(
  'station_locations',
  {
    stationId: uuid('station_id')
      .primaryKey()
      .references(() => stations.id, { onDelete: 'cascade' }),
    areaLabel: text('area_label'),
    gridIdentifier: text('grid_identifier'),
    precision: text('precision').notNull().default('hidden'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    geog: geographyPoint('geog'),
    locationSource: text('location_source').notNull().default('manual'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Supports ST_DWithin/ST_Distance "find nearby" queries (see
    // findNearbyStations in apps/api) -- geog has been populated on every
    // write since the initial migration, but had no spatial index until now.
    geogGistIdx: index('station_locations_geog_gist_idx').using('gist', table.geog),
  }),
);

/** Who may see a shaped version of this station, separate from location precision. */
export const stationPrivacy = pgTable('station_privacy', {
  stationId: uuid('station_id')
    .primaryKey()
    .references(() => stations.id, { onDelete: 'cascade' }),
  visibility: text('visibility').notNull().default('private'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stationCapabilities = pgTable(
  'station_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    capability: text('capability').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stationCapabilityUnique: uniqueIndex('station_capabilities_unique_idx').on(
      table.stationId,
      table.capability,
    ),
  }),
);

/**
 * Forward-compatible foundation for the future equipment inventory. Not
 * wired into the API in this milestone (station detail shows a
 * placeholder) but present so the data model does not need to change when
 * that feature is built.
 */
export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stationEquipment = pgTable(
  'station_equipment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePair: uniqueIndex('station_equipment_unique_idx').on(table.stationId, table.equipmentId),
  }),
);
