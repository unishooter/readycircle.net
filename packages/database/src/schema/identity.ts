import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * The durable account record. `id` is the only key ever used to resolve a
 * user internally -- email is a denormalized display/contact value, never
 * a lookup key, so a user can change providers or email addresses without
 * losing their identity or data.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    /** Descriptive label shown only in the development login picker. Always null in production data. */
    devPersona: text('dev_persona'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_idx').on(table.email),
  }),
);

/**
 * Maps an external identity provider (or the development provider) to an
 * internal user. Supports the future production shape described in the
 * identity design: user_id / provider / provider_subject / provider_email /
 * email_verified.
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'dev' | 'google' | 'apple' | 'email_magic_link' */
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    providerEmail: text('provider_email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerSubjectUnique: uniqueIndex('user_identities_provider_subject_idx').on(
      table.provider,
      table.providerSubject,
    ),
  }),
);

/**
 * Server-managed sessions backing the secure HTTP-only cookie. Only a
 * salted hash of the opaque session token is stored, never the raw value.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
  }),
);
