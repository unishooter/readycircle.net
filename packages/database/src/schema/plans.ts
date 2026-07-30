import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';
import { circles } from './circles.js';

/**
 * Minimal forward-compatible foundation for the plan engine. Content is
 * split across versioned, sectioned rows (not one large text column) so
 * that published versions can become genuinely immutable later, and so
 * individual sections can be diffed, regenerated, or reviewed
 * independently once the full plan engine is built.
 */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id')
    .notNull()
    .references(() => circles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planVersions = pgTable('plan_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  /** 'draft' | 'published'. Once published, the application layer treats the version as immutable. */
  status: text('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planSections = pgTable('plan_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  planVersionId: uuid('plan_version_id')
    .notNull()
    .references(() => planVersions.id, { onDelete: 'cascade' }),
  sectionKey: text('section_key').notNull(),
  title: text('title').notNull(),
  content: jsonb('content').notNull().default(sql`'{}'::jsonb`),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
