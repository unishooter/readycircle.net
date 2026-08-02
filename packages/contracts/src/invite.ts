import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * `expired` is a derived display value computed at read time from
 * `expiresAt < now()` -- it is never stored; the persisted `status` column
 * is only ever 'pending' | 'accepted' | 'revoked'.
 */
export const circleInviteStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type CircleInviteStatus = z.infer<typeof circleInviteStatusSchema>;

export const createCircleInviteSchema = z.object({
  /** Free-text label for the inviter's own tracking (e.g. "for Jane"). Never validated against the invitee's account. */
  note: z.string().max(200).optional(),
});
export type CreateCircleInviteInput = z.infer<typeof createCircleInviteSchema>;

export const circleInviteSummarySchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  note: z.string().nullable(),
  status: circleInviteStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  invitedByUserId: uuidSchema,
  invitedByDisplayName: z.string(),
  acceptedAt: z.string().nullable(),
  acceptedByDisplayName: z.string().nullable(),
});
export type CircleInviteSummary = z.infer<typeof circleInviteSummarySchema>;

/**
 * Returned exactly once, at creation -- the raw link is never retrievable
 * again after this response, the same one-time-reveal discipline as a
 * session cookie (only a hash is ever persisted).
 */
export const circleInviteCreatedResponseSchema = circleInviteSummarySchema.extend({
  inviteUrl: z.string(),
});
export type CircleInviteCreatedResponse = z.infer<typeof circleInviteCreatedResponseSchema>;

export const circleInvitePreviewResponseSchema = z.object({
  valid: z.boolean(),
  circleName: z.string().nullable(),
  note: z.string().nullable(),
  expiresAt: z.string().nullable(),
  /** Present when `valid` is false, e.g. 'expired' | 'revoked' | 'accepted' | 'not_found'. */
  reason: z.string().optional(),
});
export type CircleInvitePreviewResponse = z.infer<typeof circleInvitePreviewResponseSchema>;

export const acceptCircleInviteSchema = z.object({
  stationId: uuidSchema,
});
export type AcceptCircleInviteInput = z.infer<typeof acceptCircleInviteSchema>;
