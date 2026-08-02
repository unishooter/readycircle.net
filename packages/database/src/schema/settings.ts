import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Generic admin-configurable key/value overrides. A missing row for a key
 * means "no override, follow the environment default" -- this table is
 * intentionally schemaless (jsonb value) so future settings (beyond
 * `invite_only_access`) don't require another migration.
 */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
