import type { Database } from '@readycircle/database';
import { canAddStationToCircle, canManageMembers, canViewCircle, wouldLeaveCircleWithoutCoordinator } from '@readycircle/domain';
import type { CreateMembershipInput, MembershipResponse, UpdateMembershipInput } from '@readycircle/contracts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import {
  addMember,
  countActiveCoordinators,
  getMembershipById,
  getStationOwner,
  listMembers,
  setMembershipRole,
  setMembershipStatus,
  type MembershipDetail,
} from './repository.js';

function mapMembership(detail: MembershipDetail): MembershipResponse {
  return {
    id: detail.id,
    circleId: detail.circleId,
    stationId: detail.stationId,
    stationName: detail.stationName,
    userId: detail.userId,
    role: detail.role,
    status: detail.status,
    joinedAt: detail.joinedAt.toISOString(),
  };
}

export class MembershipService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listMembers(circleId: string, viewerUserId: string): Promise<MembershipResponse[]> {
    await this.requireCircleAndViewerAccess(circleId, viewerUserId);
    const rows = await listMembers(this.db, circleId);
    return rows.filter((row) => row.status === 'active').map(mapMembership);
  }

  async addMember(
    circleId: string,
    actingUserId: string,
    input: CreateMembershipInput,
    requestId: string,
  ): Promise<MembershipResponse> {
    // Deliberately does not require the actor to already be a Circle
    // viewer: adding your own station is how a station owner *joins* a
    // Circle in the first place. Access is instead gated entirely by
    // station ownership (below) -- you can only ever add a station you
    // own, whether or not you're already a member of this Circle.
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');

    const station = await getStationOwner(this.db, input.stationId);
    if (!station) throw new NotFoundError('Station not found.');
    if (!canAddStationToCircle(station.ownerId, actingUserId)) {
      throw new ForbiddenError('A station may only be added to a Circle by its owner.');
    }

    const membershipId = await addMember(this.db, circleId, input.stationId, station.ownerId);
    await this.audit.record({
      actorUserId: actingUserId,
      action: 'member.added',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { stationId: input.stationId, membershipId },
    });

    const detail = await getMembershipById(this.db, membershipId);
    if (!detail) throw new NotFoundError('Membership not found after creation.');
    return mapMembership(detail);
  }

  async updateMember(
    circleId: string,
    membershipId: string,
    actingUserId: string,
    input: UpdateMembershipInput,
    requestId: string,
  ): Promise<MembershipResponse> {
    const actingRole = await getViewerRole(this.db, circleId, actingUserId);
    if (!canManageMembers(actingRole)) {
      throw new ForbiddenError('Only Circle coordinators may manage members.');
    }

    const existing = await getMembershipById(this.db, membershipId);
    if (!existing || existing.circleId !== circleId) throw new NotFoundError('Membership not found.');

    if (input.role !== undefined && input.role !== existing.role) {
      if (existing.role === 'coordinator' && input.role === 'member') {
        const otherCoordinators = await countActiveCoordinators(this.db, circleId, membershipId);
        if (wouldLeaveCircleWithoutCoordinator(otherCoordinators, true)) {
          throw new ConflictError('A Circle must always have at least one active coordinator.');
        }
      }
      await setMembershipRole(this.db, membershipId, input.role, actingUserId);
      await this.audit.record({
        actorUserId: actingUserId,
        action: 'member.role_changed',
        targetType: 'circle',
        targetId: circleId,
        requestId,
        metadata: { membershipId, role: input.role },
      });
    }

    if (input.status !== undefined && input.status !== existing.status) {
      if (input.status === 'removed' && existing.role === 'coordinator') {
        const otherCoordinators = await countActiveCoordinators(this.db, circleId, membershipId);
        if (wouldLeaveCircleWithoutCoordinator(otherCoordinators, true)) {
          throw new ConflictError('A Circle must always have at least one active coordinator.');
        }
      }
      await setMembershipStatus(this.db, membershipId, input.status);
      await this.audit.record({
        actorUserId: actingUserId,
        action: 'member.removed',
        targetType: 'circle',
        targetId: circleId,
        requestId,
        metadata: { membershipId },
      });
    }

    const updated = await getMembershipById(this.db, membershipId);
    if (!updated) throw new NotFoundError('Membership not found.');
    return mapMembership(updated);
  }

  async removeMember(
    circleId: string,
    membershipId: string,
    actingUserId: string,
    requestId: string,
  ): Promise<MembershipResponse> {
    return this.updateMember(circleId, membershipId, actingUserId, { status: 'removed' }, requestId);
  }

  private async requireCircleAndViewerAccess(circleId: string, userId: string): Promise<void> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, userId);
    if (!canViewCircle(role)) throw new ForbiddenError('You do not have access to this Circle.');
  }
}
