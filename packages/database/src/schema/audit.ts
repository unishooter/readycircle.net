import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Append-only audit trail. `metadata` must never contain precise
 * coordinates or other sensitive values -- see
 * `@readycircle/domain#sanitizeAuditMetadata`, which every audit write goes
 * through before reaching this table.
 */
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  requestId: text('request_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
