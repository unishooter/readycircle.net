import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';
import { circles } from './circles.js';
import { stations } from './stations.js';
import { planVersions } from './plans.js';

/**
 * A net is a recurring scheduled on-air check-in for a Radio Circle.
 * Upcoming occurrences are computed from the recurrence rule (see
 * packages/domain net-occurrences) rather than materialized as rows; only
 * sessions that actually ran are persisted (net_sessions + net_checkins).
 */
export const nets = pgTable(
  'nets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** Human-usable dial setting, e.g. "FRS channel 3 (462.6125 MHz)". */
    channel: text('channel').notNull(),
    /** 'weekly' | 'biweekly' | 'monthly' -- validated by contracts. */
    frequency: text('frequency').notNull(),
    /**
     * Recurrence anchor: the date of the first occurrence. Weekly/biweekly
     * step by 7/14 days from here; monthly repeats on this date's
     * nth-weekday-of-month.
     */
    firstOccursOn: date('first_occurs_on').notNull(),
    /** Local wall-clock start time, "HH:MM" 24h. */
    timeLocal: text('time_local').notNull(),
    /** IANA timezone the net is scheduled in, e.g. "America/Chicago". */
    timezone: text('timezone').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(30),
    /** Ordered net-procedure steps (array of strings). */
    procedure: jsonb('procedure').notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('active'),
    /** Provenance when created from a published plan's check-in schedule. */
    sourcePlanVersionId: uuid('source_plan_version_id').references(() => planVersions.id, {
      onDelete: 'set null',
    }),
    /** Provenance only -- see `circles.createdBy`. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    circleIdx: index('nets_circle_idx').on(table.circleId),
  }),
);

/** One net occurrence that actually ran (or is running right now). */
export const netSessions = pgTable(
  'net_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    netId: uuid('net_id')
      .notNull()
      .references(() => nets.id, { onDelete: 'cascade' }),
    /** The occurrence this session corresponds to (from the recurrence rule). */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** 'open' | 'closed' | 'cancelled' */
    status: text('status').notNull().default('open'),
    /** Which station acted as net control, when known. */
    netControlStationId: uuid('net_control_station_id').references(() => stations.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    /** Provenance only -- see `circles.createdBy`. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    netIdx: index('net_sessions_net_idx').on(table.netId),
  }),
);

export const netCheckins = pgTable(
  'net_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => netSessions.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
    /** Provenance: who recorded it (self-report or net control / coordinator). */
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (table) => ({
    sessionStationUnique: uniqueIndex('net_checkins_session_station_idx').on(
      table.sessionId,
      table.stationId,
    ),
  }),
);
