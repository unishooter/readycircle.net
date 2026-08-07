import {
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { circles } from './circles.js';
import { stations } from './stations.js';

/** Same raw PostGIS geography column pattern as `station_locations.geog`. */
const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

/**
 * Circle-scoped directory of local repeaters (ham and GMRS). Any member
 * may add one (members are the ones who know what they can hear);
 * coordinators curate. Rows imported from RepeaterBook keep `external_id`
 * so re-imports can dedupe instead of duplicating.
 */
export const repeaters = pgTable(
  'repeaters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    /** 'ham' | 'gmrs' -- validated by contracts. */
    service: text('service').notNull(),
    name: text('name').notNull(),
    callsign: text('callsign'),
    outputFrequencyMhz: doublePrecision('output_frequency_mhz').notNull(),
    /** Free text: "+5 MHz", "-0.6", or an explicit input frequency. */
    offsetOrInput: text('offset_or_input'),
    /** CTCSS/DCS tone, free text (e.g. "141.3 Hz"). */
    tone: text('tone'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    geog: geographyPoint('geog'),
    areaLabel: text('area_label'),
    /** 'manual' | 'repeaterbook' */
    source: text('source').notNull().default('manual'),
    /** RepeaterBook record id (State_ID + Rptr_ID) for import dedupe. */
    externalId: text('external_id'),
    /** 'active' | 'offline' | 'unverified' */
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    /** Provenance only -- see `circles.createdBy`. */
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    circleIdx: index('repeaters_circle_idx').on(table.circleId),
    // One imported RepeaterBook record per Circle.
    circleExternalUnique: uniqueIndex('repeaters_circle_external_idx').on(table.circleId, table.externalId),
  }),
);

/**
 * A station's declared relationship to a repeater: can hear it ('rx') or
 * can both hear and key it up ('rx_tx'). Declared by the station owner --
 * this is observed truth and outranks the RF engine's distance estimates.
 */
export const stationRepeaters = pgTable(
  'station_repeaters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    repeaterId: uuid('repeater_id')
      .notNull()
      .references(() => repeaters.id, { onDelete: 'cascade' }),
    /** 'rx' | 'rx_tx' */
    access: text('access').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stationRepeaterUnique: uniqueIndex('station_repeaters_station_repeater_idx').on(
      table.stationId,
      table.repeaterId,
    ),
  }),
);

/**
 * A logged station→repeater access check (heard / keyed the machine). May
 * include an optional free-text note about who was heard. On create the API
 * upserts `station_repeaters` so RF planning keeps using declared links.
 * Deleting a check does not remove the declared link.
 */
export const repeaterChecks = pgTable(
  'repeater_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    repeaterId: uuid('repeater_id')
      .notNull()
      .references(() => repeaters.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** 'rx' | 'rx_tx' */
    access: text('access').notNull(),
    /** Optional note about who was heard (callsign or "unspecified"). */
    counterpartyNote: text('counterparty_note'),
    signalRating: integer('signal_rating'),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    circleIdx: index('repeater_checks_circle_idx').on(table.circleId),
    stationIdx: index('repeater_checks_station_idx').on(table.stationId),
    repeaterIdx: index('repeater_checks_repeater_idx').on(table.repeaterId),
  }),
);
