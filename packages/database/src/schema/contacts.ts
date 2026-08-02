import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { circles } from './circles.js';
import { stations } from './stations.js';
import { netSessions } from './nets.js';

/**
 * A logged QSO: `stationId` declares that it successfully talked to
 * `counterpartyStationId` within `circleId`. Like `station_repeaters`, this
 * is one-sided, self-declared observed truth -- there is no mutual
 * confirmation workflow -- and the RF reachability engine treats it as
 * outranking its own distance estimates, bumping the pair's verdict to
 * 'likely' and flagging the link as confirmed (see packages/domain
 * rf-reachability.ts). `mode` reuses the same vocabulary as
 * `connectivityPathTypeSchema` so a confirmed contact can stand in directly
 * for an estimated path type.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    counterpartyStationId: uuid('counterparty_station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** 'simplex' | 'repeater' | 'satellite' | 'mesh' -- validated by contracts. */
    mode: text('mode').notNull(),
    /** Human-usable dial setting, free text like `nets.channel`. */
    channel: text('channel'),
    /** Simple 1-5 signal-quality rating, self-reported. */
    signalRating: integer('signal_rating'),
    notes: text('notes'),
    /** Set when the contact happened during a specific net session. */
    netSessionId: uuid('net_session_id').references(() => netSessions.id, { onDelete: 'set null' }),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    circleIdx: index('contacts_circle_idx').on(table.circleId),
    stationIdx: index('contacts_station_idx').on(table.stationId),
    counterpartyIdx: index('contacts_counterparty_idx').on(table.counterpartyStationId),
  }),
);
