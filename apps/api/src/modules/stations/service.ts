import type { Database } from '@readycircle/database';
import {
  canArchiveStation,
  canEditStation,
  canViewStation,
  shapeStationDetailFields,
  shapeStationLocation,
} from '@readycircle/domain';
import type {
  CreateStationInput,
  ExperienceLevel,
  LocationPrecision,
  RadioCapability,
  RecordStatus,
  StationAuthorization,
  StationGoal,
  StationResponse,
  StationType,
  StationVisibility,
  UpdateStationInput,
} from '@readycircle/contracts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
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
      status: record.station.status as RecordStatus,
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
      isOwner,
      createdAt: record.station.createdAt.toISOString(),
      updatedAt: record.station.updatedAt.toISOString(),
    };
  }
}
