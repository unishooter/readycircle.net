import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
  /** Provenance only -- a plan belongs to its Circle and must survive its creator's account being deleted (see `circles.createdBy`). */
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planVersions = pgTable('plan_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  /**
   * 'generating' | 'draft' | 'failed' | 'published'. Versions are created as
   * 'generating' while the async plan engine assembles content, become
   * 'draft' when ready for review (or 'failed' with `errorMessage` set), and
   * once published the application layer treats the version as immutable.
   */
  status: text('status').notNull().default('draft'),
  /**
   * Snapshot of the assembled Circle context (roster, capabilities, shaped
   * locations) the generator worked from, kept for auditability: a published
   * plan can always be traced back to the exact inputs that produced it.
   */
  contextSnapshot: jsonb('context_snapshot'),
  /** Human-readable failure reason when status = 'failed'. */
  errorMessage: text('error_message'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  /** Provenance only -- see `plans.createdBy`. */
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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

/**
 * A rendered artifact (currently PDF) produced from a published plan
 * version and stored in the document store (S3 in production, local disk in
 * development). One row per version+format; regeneration overwrites the row
 * rather than accumulating duplicates.
 */
export const planDocuments = pgTable(
  'plan_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planVersionId: uuid('plan_version_id')
      .notNull()
      .references(() => planVersions.id, { onDelete: 'cascade' }),
    format: text('format').notNull().default('pdf'),
    /** Key within the document store (S3 object key / relative file path). */
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull().default('application/pdf'),
    /** 'pending' | 'ready' | 'failed' */
    status: text('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    versionFormatUnique: uniqueIndex('plan_documents_version_format_idx').on(table.planVersionId, table.format),
  }),
);
