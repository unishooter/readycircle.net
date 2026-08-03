import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { stations } from './stations.js';

export const circles = pgTable(
  'circles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Short, human-readable public identifier (format: consonant-vowel-
     * consonant-digit, e.g. "RAV7"), shown to members for display, verbal
     * communication, and support. This is NOT a primary key and must NEVER
     * be used as a foreign key or for internal joins -- all relationships,
     * API route params, and DB lookups must keep using `id` above.
     * Generated once by `generateCircleIdentifier` (packages/domain) at
     * creation time and is immutable afterward; see migration 0012 for the
     * unique index and `backfill-circle-identifiers.ts` for how existing
     * rows were assigned one.
     */
    circleIdentifier: text('circle_identifier').notNull(),
    circleType: text('circle_type').notNull(),
    name: text('name').notNull(),
    shortDescription: text('short_description'),
    purpose: text('purpose'),
    areaLabel: text('area_label').notNull(),
    gridOrLocalityLabel: text('grid_or_locality_label'),
    isPrivate: boolean('is_private').notNull().default(true),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    memberSharingPolicy: text('member_sharing_policy').notNull().default('coordinators_only'),
    status: text('status').notNull().default('active'),
    /**
     * Provenance only, not an ownership relationship -- a Circle has its own
     * members and coordinators and must survive its founder's account being
     * deleted, so this is nullable and set to null rather than cascading
     * (contrast with `stations.ownerId`, which does cascade).
     */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    circleIdentifierUnique: uniqueIndex('circles_circle_identifier_idx').on(table.circleIdentifier),
  }),
);

/**
 * A membership references both the user and the station explicitly (a
 * station may only be added by its owner, and stations -- not people --
 * are what actually participate in a Circle's communications).
 */
export const circleMemberships = pgTable(
  'circle_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    circleStationUnique: uniqueIndex('circle_memberships_circle_station_idx').on(
      table.circleId,
      table.stationId,
    ),
  }),
);

/**
 * A small, seeded role catalog (coordinator / member today) rather than a
 * hardcoded enum column, so future Circle-specific roles (e.g. net
 * control) can be added without a schema change.
 */
export const circleRoles = pgTable(
  'circle_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyUnique: uniqueIndex('circle_roles_key_idx').on(table.key),
  }),
);

export const circleRoleAssignments = pgTable(
  'circle_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => circleMemberships.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => circleRoles.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    /** Provenance only -- see `circles.createdBy` for the same reasoning. */
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    membershipRoleUnique: uniqueIndex('circle_role_assignments_membership_role_idx').on(
      table.membershipId,
      table.roleId,
    ),
  }),
);

/**
 * A single-use, signed invite link that lets an invitee join a Circle
 * without going through the plain "add my station by circle ID" flow --
 * any active member may create one (see `canCreateCircleInvite` in
 * packages/domain). Only a hash of the raw token is ever stored, the same
 * discipline as `sessions.tokenHash`; the raw token is shown to the
 * inviter exactly once, at creation time. `type` future-proofs other kinds
 * of invite (e.g. a direct admin invite with no Circle) without another
 * migration -- today only `'circle_join'` exists.
 */
export const circleInvitations = pgTable(
  'circle_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('circle_join'),
    /** Free-text label the inviter sets for their own tracking; never validated against the invitee's account. */
    invitedEmail: text('invited_email'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    /** 'pending' | 'accepted' | 'revoked'. Expiry is derived from `expiresAt` at read time, never stored. */
    status: text('status').notNull().default('pending'),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('circle_invitations_token_hash_idx').on(table.tokenHash),
  }),
);
