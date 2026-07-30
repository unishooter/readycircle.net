import type { Database } from '@readycircle/database';
import { canAddStationToCircle, canEditCircle, canViewCircle } from '@readycircle/domain';
import {
  CIRCLE_TYPE_LABELS,
  type CircleResponse,
  type CircleType,
  type CreateCircleInput,
  type MemberSharingPolicy,
  type RecordStatus,
  type UpdateCircleInput,
} from '@readycircle/contracts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getStationOwner } from '../memberships/repository.js';
import {
  createCircleRecord,
  getCircleById,
  getCircleCounts,
  getViewerRole,
  listCirclesForUser,
  updateCircleRecord,
  type CircleRow,
} from './repository.js';

export class CircleService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listMyCircles(userId: string): Promise<CircleResponse[]> {
    const rows = await listCirclesForUser(this.db, userId);
    return Promise.all(rows.map((row) => this.shape(row, userId)));
  }

  async createCircle(userId: string, input: CreateCircleInput, requestId: string): Promise<CircleResponse> {
    const station = await getStationOwner(this.db, input.creatorStationId);
    if (!station) throw new NotFoundError('Station not found.');
    if (!canAddStationToCircle(station.ownerId, userId)) {
      throw new ForbiddenError('You may only participate in a Circle with a station you own.');
    }

    const circleId = await createCircleRecord(this.db, userId, input);
    await this.audit.record({
      actorUserId: userId,
      action: 'circle.created',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { circleType: input.circleType },
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'member.added',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { stationId: input.creatorStationId, role: 'coordinator' },
    });

    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found after creation.');
    return this.shape(circle, userId, 'coordinator');
  }

  async getCircle(circleId: string, userId: string): Promise<CircleResponse> {
    const circle = await this.requireCircle(circleId);
    const role = await getViewerRole(this.db, circleId, userId);
    if (!canViewCircle(role)) throw new ForbiddenError('You do not have access to this Circle.');
    return this.shape(circle, userId, role);
  }

  async updateCircle(
    circleId: string,
    userId: string,
    input: UpdateCircleInput,
    requestId: string,
  ): Promise<CircleResponse> {
    await this.requireCircle(circleId);
    const role = await getViewerRole(this.db, circleId, userId);
    if (!canEditCircle(role)) throw new ForbiddenError('Only Circle coordinators may edit this Circle.');
    const updated = await updateCircleRecord(this.db, circleId, input);
    if (!updated) throw new NotFoundError('Circle not found.');
    await this.audit.record({
      actorUserId: userId,
      action: 'circle.updated',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { fields: Object.keys(input) },
    });
    return this.shape(updated, userId, role);
  }

  async archiveCircle(circleId: string, userId: string, requestId: string): Promise<CircleResponse> {
    await this.requireCircle(circleId);
    const role = await getViewerRole(this.db, circleId, userId);
    if (!canEditCircle(role)) throw new ForbiddenError('Only Circle coordinators may archive this Circle.');
    const updated = await updateCircleRecord(this.db, circleId, { status: 'archived' });
    if (!updated) throw new NotFoundError('Circle not found.');
    await this.audit.record({
      actorUserId: userId,
      action: 'circle.updated',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { status: 'archived' },
    });
    return this.shape(updated, userId, role);
  }

  private async requireCircle(circleId: string): Promise<CircleRow> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    return circle;
  }

  private async shape(
    circle: CircleRow,
    viewerUserId: string,
    knownRole?: 'coordinator' | 'member' | null,
  ): Promise<CircleResponse> {
    const counts = await getCircleCounts(this.db, circle.id);
    const role = knownRole !== undefined ? knownRole : await getViewerRole(this.db, circle.id, viewerUserId);
    return {
      id: circle.id,
      circleType: circle.circleType as CircleType,
      circleTypeLabel: CIRCLE_TYPE_LABELS[circle.circleType as CircleType],
      name: circle.name,
      shortDescription: circle.shortDescription,
      purpose: circle.purpose,
      area: { areaLabel: circle.areaLabel, gridOrLocalityLabel: circle.gridOrLocalityLabel },
      isPrivate: circle.isPrivate,
      requiresApproval: circle.requiresApproval,
      memberSharingPolicy: circle.memberSharingPolicy as MemberSharingPolicy,
      status: circle.status as RecordStatus,
      memberCount: counts.memberCount,
      coordinatorCount: counts.coordinatorCount,
      viewerRole: role,
      createdAt: circle.createdAt.toISOString(),
      updatedAt: circle.updatedAt.toISOString(),
    };
  }
}
