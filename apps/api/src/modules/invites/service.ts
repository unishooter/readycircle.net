import { createHmac, randomBytes } from 'node:crypto';
import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import { canAddStationToCircle, canCreateCircleInvite } from '@readycircle/domain';
import type {
  AcceptCircleInviteInput,
  CircleInviteCreatedResponse,
  CircleInvitePreviewResponse,
  CircleInviteStatus,
  CircleInviteSummary,
  CreateCircleInviteInput,
} from '@readycircle/contracts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { addMember, getStationOwner } from '../memberships/repository.js';
import {
  createCircleInvite,
  getCircleInviteById,
  getCircleInviteByTokenHash,
  listCircleInvites,
  markCircleInviteAccepted,
  markCircleInviteRevoked,
  type CircleInviteRow,
} from './repository.js';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function hashInviteToken(token: string, sessionSecret: string): string {
  return createHmac('sha256', sessionSecret).update(token).digest('hex');
}

/** `expired` is derived at read time -- the stored `status` never changes just because time passed. */
function effectiveStatus(row: CircleInviteRow): CircleInviteStatus {
  if (row.status === 'pending' && row.expiresAt.getTime() < Date.now()) return 'expired';
  return row.status;
}

/**
 * Shared by the public preview endpoint and the invite-only sign-up gate
 * (`auth/routes.ts`, `session/routes.ts`) -- both just need "is this token
 * still usable", without the richer preview payload.
 */
export async function isCircleInviteTokenValid(db: Database, config: AppConfig, token: string): Promise<boolean> {
  const tokenHash = hashInviteToken(token, config.sessionSecret);
  const row = await getCircleInviteByTokenHash(db, tokenHash);
  if (!row) return false;
  return effectiveStatus(row) === 'pending';
}

function mapSummary(row: CircleInviteRow): CircleInviteSummary {
  return {
    id: row.id,
    circleId: row.circleId,
    note: row.note,
    status: effectiveStatus(row),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    invitedByUserId: row.invitedByUserId,
    invitedByDisplayName: row.invitedByDisplayName,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    acceptedByDisplayName: row.acceptedByDisplayName,
  };
}

export class InviteService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async createInvite(
    circleId: string,
    actingUserId: string,
    input: CreateCircleInviteInput,
    requestId: string,
  ): Promise<CircleInviteCreatedResponse> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');

    const role = await getViewerRole(this.db, circleId, actingUserId);
    if (!canCreateCircleInvite(role)) {
      throw new ForbiddenError('Only active Circle members may create an invite.');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(token, this.config.sessionSecret);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const inviteId = await createCircleInvite(this.db, circleId, actingUserId, tokenHash, expiresAt, input.note ?? null);

    await this.audit.record({
      actorUserId: actingUserId,
      action: 'invite.created',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { inviteId },
    });

    const row = await getCircleInviteById(this.db, inviteId);
    if (!row) throw new NotFoundError('Invite not found after creation.');
    return { ...mapSummary(row), inviteUrl: `${this.config.appBaseUrl}/invite/${token}` };
  }

  async listInvites(circleId: string, viewerUserId: string): Promise<CircleInviteSummary[]> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, viewerUserId);
    if (!canCreateCircleInvite(role)) {
      throw new ForbiddenError('You do not have access to this Circle.');
    }
    const rows = await listCircleInvites(this.db, circleId);
    return rows.map(mapSummary);
  }

  async previewInvite(token: string): Promise<CircleInvitePreviewResponse> {
    const tokenHash = hashInviteToken(token, this.config.sessionSecret);
    const row = await getCircleInviteByTokenHash(this.db, tokenHash);
    if (!row) {
      return { valid: false, circleName: null, note: null, expiresAt: null, reason: 'not_found' };
    }
    const status = effectiveStatus(row);
    if (status !== 'pending') {
      return {
        valid: false,
        circleName: row.circleName,
        note: row.note,
        expiresAt: row.expiresAt.toISOString(),
        reason: status,
      };
    }
    return { valid: true, circleName: row.circleName, note: row.note, expiresAt: row.expiresAt.toISOString() };
  }

  async acceptInvite(
    token: string,
    userId: string,
    input: AcceptCircleInviteInput,
    requestId: string,
  ): Promise<CircleInviteSummary> {
    const tokenHash = hashInviteToken(token, this.config.sessionSecret);
    const row = await getCircleInviteByTokenHash(this.db, tokenHash);
    if (!row) throw new NotFoundError('Invite not found.');

    const status = effectiveStatus(row);
    if (status !== 'pending') {
      throw new ConflictError(`This invite is no longer valid (${status}).`);
    }

    const station = await getStationOwner(this.db, input.stationId);
    if (!station) throw new NotFoundError('Station not found.');
    if (!canAddStationToCircle(station.ownerId, userId)) {
      throw new ForbiddenError('A station may only be added to a Circle by its owner.');
    }

    await addMember(this.db, row.circleId, input.stationId, userId);
    await markCircleInviteAccepted(this.db, row.id, userId);

    await this.audit.record({
      actorUserId: userId,
      action: 'invite.accepted',
      targetType: 'circle',
      targetId: row.circleId,
      requestId,
      metadata: { inviteId: row.id, stationId: input.stationId },
    });

    const updated = await getCircleInviteById(this.db, row.id);
    if (!updated) throw new NotFoundError('Invite not found after accepting.');
    return mapSummary(updated);
  }

  async revokeInvite(inviteId: string, actingUserId: string, requestId: string): Promise<CircleInviteSummary> {
    const row = await getCircleInviteById(this.db, inviteId);
    if (!row) throw new NotFoundError('Invite not found.');

    const role = await getViewerRole(this.db, row.circleId, actingUserId);
    if (!canCreateCircleInvite(role)) {
      throw new ForbiddenError('Only active Circle members may revoke an invite.');
    }

    const status = effectiveStatus(row);
    if (status !== 'pending') {
      throw new ConflictError(`This invite is already ${status} and cannot be revoked.`);
    }

    await markCircleInviteRevoked(this.db, inviteId, actingUserId);
    await this.audit.record({
      actorUserId: actingUserId,
      action: 'invite.revoked',
      targetType: 'circle',
      targetId: row.circleId,
      requestId,
      metadata: { inviteId },
    });

    const updated = await getCircleInviteById(this.db, inviteId);
    if (!updated) throw new NotFoundError('Invite not found after revoking.');
    return mapSummary(updated);
  }
}
