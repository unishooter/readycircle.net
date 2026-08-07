import type { Database } from '@readycircle/database';
import { canLogRepeaterCheck } from '@readycircle/domain';
import type { LogRepeaterCheckInput, RepeaterCheckResponse } from '@readycircle/contracts';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { listActiveMemberStations } from '../nets/repository.js';
import { getRepeaterById, upsertStationRepeaterAccess } from '../repeaters/repository.js';
import {
  deleteRepeaterCheck,
  getRepeaterCheckById,
  insertRepeaterCheck,
  listRepeaterChecksByCircle,
  type RepeaterCheckRow,
} from './repository.js';

function mapResponse(
  row: RepeaterCheckRow,
  viewerUserId: string,
  viewerIsCoordinator: boolean,
): RepeaterCheckResponse {
  return {
    id: row.id,
    circleId: row.circleId,
    stationId: row.stationId,
    stationName: row.stationName,
    repeaterId: row.repeaterId,
    repeaterName: row.repeaterName,
    occurredAt: row.occurredAt.toISOString(),
    access: row.access as RepeaterCheckResponse['access'],
    counterpartyNote: row.counterpartyNote,
    signalRating: row.signalRating,
    notes: row.notes,
    recordedByUserId: row.recordedByUserId,
    recordedByDisplayName: row.recordedByDisplayName,
    viewerCanDelete: row.recordedByUserId === viewerUserId || viewerIsCoordinator,
    createdAt: row.createdAt.toISOString(),
  };
}

export class RepeaterCheckService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async logCheck(
    circleId: string,
    actingUserId: string,
    input: LogRepeaterCheckInput,
    requestId: string,
  ): Promise<RepeaterCheckResponse> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');

    const role = await getViewerRole(this.db, circleId, actingUserId);
    if (!canLogRepeaterCheck(role)) {
      throw new ForbiddenError('Only active Circle members may log a repeater check.');
    }

    const members = await listActiveMemberStations(this.db, circleId);
    const station = members.find((member) => member.stationId === input.stationId);
    if (!station) throw new BadRequestError('That station is not an active member of this Circle.');
    if (station.ownerId !== actingUserId) {
      throw new ForbiddenError('You may only log a repeater check for a station you own.');
    }

    const repeater = await getRepeaterById(this.db, input.repeaterId);
    if (!repeater || repeater.circleId !== circleId) {
      throw new BadRequestError('That repeater is not in this Circle directory.');
    }

    const occurredAt = new Date(input.occurredAt);
    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestError('occurredAt cannot be in the future.');
    }

    const checkId = await insertRepeaterCheck(this.db, {
      circleId,
      stationId: input.stationId,
      repeaterId: input.repeaterId,
      occurredAt,
      access: input.access,
      counterpartyNote: input.counterpartyNote ?? null,
      signalRating: input.signalRating ?? null,
      notes: input.notes ?? null,
      recordedByUserId: actingUserId,
    });

    await upsertStationRepeaterAccess(this.db, input.stationId, input.repeaterId, input.access);

    await this.audit.record({
      actorUserId: actingUserId,
      action: 'repeater_check.logged',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { checkId, stationId: input.stationId, repeaterId: input.repeaterId, access: input.access },
    });

    const row = await getRepeaterCheckById(this.db, checkId);
    if (!row) throw new NotFoundError('Repeater check not found after creation.');
    return mapResponse(row, actingUserId, role === 'coordinator');
  }

  async listForCircle(circleId: string, viewerUserId: string): Promise<RepeaterCheckResponse[]> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, viewerUserId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    const rows = await listRepeaterChecksByCircle(this.db, circleId);
    return rows.map((row) => mapResponse(row, viewerUserId, role === 'coordinator'));
  }

  async deleteCheck(checkId: string, actingUserId: string, requestId: string): Promise<void> {
    const row = await getRepeaterCheckById(this.db, checkId);
    if (!row) throw new NotFoundError('Repeater check not found.');

    const role = await getViewerRole(this.db, row.circleId, actingUserId);
    const isCoordinator = role === 'coordinator';
    if (row.recordedByUserId !== actingUserId && !isCoordinator) {
      throw new ForbiddenError('You may only delete a repeater check you logged (or as coordinator).');
    }

    await deleteRepeaterCheck(this.db, checkId);
    await this.audit.record({
      actorUserId: actingUserId,
      action: 'repeater_check.deleted',
      targetType: 'circle',
      targetId: row.circleId,
      requestId,
      metadata: { checkId },
    });
  }
}
