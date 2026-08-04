import type { Database } from '@readycircle/database';
import {
  canArchiveStation,
  canEditStation,
  canViewStation,
  shapeStationDetailFields,
  shapeStationLocation,
} from '@readycircle/domain';
import type {
  AntennaType,
  BackupPower,
  CreateStationInput,
  ExperienceLevel,
  LocationPrecision,
  RadioCapability,
  SetStationRepeatersInput,
  StationAuthorization,
  StationGoal,
  StationRepeaterOption,
  StationRepeaterResponse,
  StationResponse,
  StationStatus,
  StationType,
  StationVisibility,
  UpdateStationInput,
  RepeaterAccess,
  RepeaterService,
} from '@readycircle/contracts';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import {
  getRepeaterById,
  listActiveCircleIdsForStation,
  listLinksForStation,
  listRepeatersForCircles,
  replaceLinksForStation,
} from '../repeaters/repository.js';
import {
  archiveStationRecord,
  createStationRecord,
  getStationById,
  getViewerStationContext,
  listStationsByOwner,
  updateStationRecord,
  type FullStationRecord,
} from './repository.js';

export class StationService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listMyStations(ownerId: string): Promise<StationResponse[]> {
    const rows = await listStationsByOwner(this.db, ownerId);
    return rows.map((row) => this.shape(row, true, { sharesCircle: false, isCoordinator: false }));
  }

  async createStation(ownerId: string, input: CreateStationInput, requestId: string): Promise<StationResponse> {
    const created = await createStationRecord(this.db, ownerId, input);
    await this.audit.record({
      actorUserId: ownerId,
      action: 'station.created',
      targetType: 'station',
      targetId: created.station.id,
      requestId,
      metadata: { stationType: input.stationType, visibility: input.visibility, capabilities: input.capabilities },
    });
    return this.shape(created, true, { sharesCircle: false, isCoordinator: false });
  }

  async getStation(stationId: string, viewerUserId: string): Promise<StationResponse> {
    const record = await this.requireRecord(stationId);
    const isOwner = record.station.ownerId === viewerUserId;
    if (isOwner) {
      return this.shape(record, true, { sharesCircle: false, isCoordinator: false });
    }

    const visibility = (record.privacy?.visibility ?? 'private') as StationVisibility;
    const viewerContext = await getViewerStationContext(this.db, stationId, viewerUserId);
    const allowed = canViewStation(
      { isOwner: false, sharesCircleWithViewer: viewerContext.sharesCircle, isCoordinatorOfSharedCircle: viewerContext.isCoordinator },
      visibility,
    );
    if (!allowed) {
      throw new ForbiddenError('You do not have access to this station.');
    }
    return this.shape(record, false, viewerContext);
  }

  async updateStation(
    stationId: string,
    ownerId: string,
    input: UpdateStationInput,
    requestId: string,
  ): Promise<StationResponse> {
    const existing = await this.requireRecord(stationId);
    if (!canEditStation(existing.station.ownerId === ownerId)) {
      throw new ForbiddenError('Only the station owner may edit this station.');
    }
    const updated = await updateStationRecord(this.db, stationId, input);
    if (!updated) throw new NotFoundError('Station not found.');
    await this.audit.record({
      actorUserId: ownerId,
      action: 'station.updated',
      targetType: 'station',
      targetId: stationId,
      requestId,
      metadata: { fields: Object.keys(input) },
    });
    return this.shape(updated, true, { sharesCircle: false, isCoordinator: false });
  }

  async archiveStation(stationId: string, ownerId: string, requestId: string): Promise<StationResponse> {
    const existing = await this.requireRecord(stationId);
    if (!canArchiveStation(existing.station.ownerId === ownerId)) {
      throw new ForbiddenError('Only the station owner may archive this station.');
    }
    await archiveStationRecord(this.db, stationId);
    await this.audit.record({
      actorUserId: ownerId,
      action: 'station.archived',
      targetType: 'station',
      targetId: stationId,
      requestId,
    });
    const updated = await this.requireRecord(stationId);
    return this.shape(updated, true, { sharesCircle: false, isCoordinator: false });
  }

  // -------------------------------------------------------------------------
  // Repeater RX/TX links
  // -------------------------------------------------------------------------

  /** Repeaters the station could declare access to, from all its Circles. */
  async listAvailableRepeaters(stationId: string, userId: string): Promise<StationRepeaterOption[]> {
    const record = await this.requireRecord(stationId);
    if (record.station.ownerId !== userId) {
      throw new ForbiddenError('Only the station owner may view repeater options.');
    }
    const circleIds = await listActiveCircleIdsForStation(this.db, stationId);
    const rows = await listRepeatersForCircles(this.db, circleIds);
    return rows.map(({ repeater, circleName }) => ({
      repeaterId: repeater.id,
      name: repeater.name,
      service: repeater.service as RepeaterService,
      outputFrequencyMhz: repeater.outputFrequencyMhz,
      tone: repeater.tone,
      areaLabel: repeater.areaLabel,
      status: repeater.status as StationRepeaterOption['status'],
      circleId: repeater.circleId,
      circleName,
    }));
  }

  async listRepeaterLinks(stationId: string, userId: string): Promise<StationRepeaterResponse[]> {
    const record = await this.requireRecord(stationId);
    if (record.station.ownerId !== userId) {
      throw new ForbiddenError('Only the station owner may view repeater links.');
    }
    const rows = await listLinksForStation(this.db, stationId);
    return rows.map(({ link, repeater, circleName }) => ({
      repeaterId: repeater.id,
      access: link.access as RepeaterAccess,
      repeaterName: repeater.name,
      service: repeater.service as RepeaterService,
      outputFrequencyMhz: repeater.outputFrequencyMhz,
      circleId: repeater.circleId,
      circleName,
    }));
  }

  /**
   * Replaces the station's full set of declared repeater links. Every
   * target repeater must belong to a Circle the station is an active
   * member of -- a station can't declare access to repeaters it has no
   * roster relationship with.
   */
  async setRepeaterLinks(
    stationId: string,
    userId: string,
    input: SetStationRepeatersInput,
    requestId: string,
  ): Promise<StationRepeaterResponse[]> {
    const record = await this.requireRecord(stationId);
    if (record.station.ownerId !== userId) {
      throw new ForbiddenError('Only the station owner may change repeater links.');
    }

    const circleIds = new Set(await listActiveCircleIdsForStation(this.db, stationId));
    for (const link of input.links) {
      const repeater = await getRepeaterById(this.db, link.repeaterId);
      if (!repeater || !circleIds.has(repeater.circleId)) {
        throw new BadRequestError('One of the selected repeaters does not belong to a Circle of this station.');
      }
    }

    await replaceLinksForStation(this.db, stationId, input.links);
    await this.audit.record({
      actorUserId: userId,
      action: 'station.updated',
      targetType: 'station',
      targetId: stationId,
      requestId,
      metadata: { fields: ['repeaterLinks'], linkCount: input.links.length },
    });
    return this.listRepeaterLinks(stationId, userId);
  }

  private async requireRecord(stationId: string): Promise<FullStationRecord> {
    const record = await getStationById(this.db, stationId);
    if (!record) throw new NotFoundError('Station not found.');
    return record;
  }

  private shape(
    record: FullStationRecord,
    isOwner: boolean,
    viewerContext: { sharesCircle: boolean; isCoordinator: boolean },
  ): StationResponse {
    const location = shapeStationLocation(
      {
        areaLabel: record.location?.areaLabel ?? null,
        gridIdentifier: record.location?.gridIdentifier ?? null,
        precision: (record.location?.precision ?? 'hidden') as LocationPrecision,
        latitude: record.location?.latitude ?? null,
        longitude: record.location?.longitude ?? null,
      },
      isOwner,
    );

    // Owner and Circle coordinators see experience/authorization/goals;
    // plain Circle members only see roster-level fields (name, type,
    // capabilities, generalized area) -- a conservative default consistent
    // with the privacy principles in the spec.
    const canSeeDetail = isOwner || viewerContext.isCoordinator;
    const detail = shapeStationDetailFields(
      {
        experienceLevel: record.station.experienceLevel,
        authorization: record.station.authorization,
        goals: record.station.goals,
      },
      canSeeDetail,
    );

    const visibility = (record.privacy?.visibility ?? 'private') as StationVisibility;

    return {
      id: record.station.id,
      ownerId: record.station.ownerId,
      name: record.station.name,
      stationType: record.station.stationType as StationType,
      status: record.station.status as StationStatus,
      location,
      capabilities: record.capabilities as RadioCapability[],
      experienceLevel: detail.experienceLevel as ExperienceLevel | null,
      authorization: detail.authorization as StationAuthorization | null,
      goals: detail.goals as StationGoal[],
      participatesInScheduledChecks: record.station.participatesInScheduledChecks,
      willingToRelay: record.station.willingToRelay,
      willingToActAsNetControl: record.station.willingToActAsNetControl,
      receiveOnly: record.station.receiveOnly,
      visibility,
      callsign: record.station.callsign,
      transmitPowerWatts: record.station.transmitPowerWatts,
      antennaType: record.station.antennaType as AntennaType | null,
      antennaHeightFeet: record.station.antennaHeightFeet,
      backupPower: (record.station.backupPower ?? []) as BackupPower[],
      isOwner,
      createdAt: record.station.createdAt.toISOString(),
      updatedAt: record.station.updatedAt.toISOString(),
    };
  }
}
