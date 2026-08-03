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
    /**
     * Optional contact fields the member fills in themselves (never sourced
     * from an auth provider). Each has its own visibility flag so a member
     * can share, say, a phone number with their Circles without also
     * exposing a mailing address.
     *
     * `contactEmail` is deliberately independent from the login `email`
     * column above -- it's the address shared with fellow Circle members,
     * not the account-linking key. When null, callers fall back to the
     * login email as a live default rather than copying it in, so it keeps
     * tracking the login email until the member explicitly overrides it.
     */
    contactEmail: text('contact_email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    /** Governs `contactEmail`. */
    emailVisibleToCircle: boolean('email_visible_to_circle').notNull().default(false),
    /** Governs `phone`. */
    phoneVisibleToCircle: boolean('phone_visible_to_circle').notNull().default(false),
    /** Governs `address`, `city`, `state`, and `zip` together as one mailing address. */
    addressVisibleToCircle: boolean('address_visible_to_circle').notNull().default(false),
    /** Descriptive label shown only in the development login picker. Always null in production data. */
    devPersona: text('dev_persona'),
    /**
     * Platform-wide admin flag (distinct from Circle coordinator/member
     * roles). Admins manage other admins and platform settings like
     * invite-only access. At least one admin must always exist -- see
     * `wouldLeaveAppWithoutAdmin` in packages/domain.
     */
    isAdmin: boolean('is_admin').notNull().default(false),
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
    /** 'dev' | 'google' | 'apple' | 'email_password' */
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
