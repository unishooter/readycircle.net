import type { Database } from '@readycircle/database';
import { canLogRepeaterCheck } from '@readycircle/domain';
import type { ContactLocation, LogRepeaterCheckInput, RepeaterCheckResponse } from '@readycircle/contracts';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { listActiveMemberStations } from '../nets/repository.js';
import { getRepeaterById, upsertStationRepeaterAccess } from '../repeaters/repository.js';
import {
  deleteRepeaterCheck,
  getRepeaterCheckById,
  getStationCoords,
  insertRepeaterCheck,
  listRepeaterChecksByCircle,
  type RepeaterCheckRow,
} from './repository.js';

function locationOrNull(lat: number | null, lng: number | null): ContactLocation | null {
  if (lat == null || lng == null) return null;
  return { latitude: lat, longitude: lng };
}

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
    heardStationId: row.heardStationId,
    heardStationName: row.heardStationName,
    signalRating: row.signalRating,
    notes: row.notes,
    stationLocation: locationOrNull(row.stationLatitude, row.stationLongitude),
    stationLocationOverridden: row.stationLocationOverridden,
    recordedByUserId: row.recordedByUserId,
    recordedByDisplayName: row.recordedByDisplayName,
    viewerCanDelete: row.recordedByUserId === viewerUserId || viewerIsCoordinator,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveStationSnapshot(
  db: Database,
  stationId: string,
  provided: ContactLocation | null | undefined,
  overriddenFlag: boolean | undefined,
): Promise<{ latitude: number | null; longitude: number | null; overridden: boolean }> {
  if (provided === null) {
    return { latitude: null, longitude: null, overridden: false };
  }
  if (provided !== undefined) {
    return {
      latitude: provided.latitude,
      longitude: provided.longitude,
      overridden: overriddenFlag ?? true,
    };
  }
  const home = await getStationCoords(db, stationId);
  return {
    latitude: home?.latitude ?? null,
    longitude: home?.longitude ?? null,
    overridden: false,
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

    let heardStationId: string | null = null;
    let counterpartyNote = input.counterpartyNote?.trim() || null;
    if (input.heardStationId) {
      const heard = members.find((member) => member.stationId === input.heardStationId);
      if (!heard) {
        throw new BadRequestError('That station is not an active member of this Circle.');
      }
      if (heard.stationId === input.stationId) {
        throw new BadRequestError('Who you heard cannot be the same as your logging station.');
      }
      heardStationId = heard.stationId;
      if (!counterpartyNote) {
        counterpartyNote = heard.stationName;
      }
    }

    const snap = await resolveStationSnapshot(
      this.db,
      input.stationId,
      input.stationLocation,
      input.stationLocationOverridden,
    );

    const checkId = await insertRepeaterCheck(this.db, {
      circleId,
      stationId: input.stationId,
      repeaterId: input.repeaterId,
      occurredAt,
      access: input.access,
      counterpartyNote,
      heardStationId,
      signalRating: input.signalRating ?? null,
      notes: input.notes ?? null,
      stationLatitude: snap.latitude,
      stationLongitude: snap.longitude,
      stationLocationOverridden: snap.overridden,
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
