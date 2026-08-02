import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import { haversineKm } from '@readycircle/domain';
import type {
  CreateRepeaterInput,
  ImportRepeatersInput,
  RepeaterImportSearchQuery,
  RepeaterImportSearchResponse,
  RepeaterResponse,
  RepeaterService as RepeaterServiceKind,
  RepeaterStatus,
  UpdateRepeaterInput,
} from '@readycircle/contracts';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { reverseGeocodeState } from '../geocoding/nominatim-client.js';
import { fetchStateRepeaters, type RepeaterBookEntry } from './repeaterbook-client.js';
import {
  createRepeaterRecord,
  deleteRepeaterRecord,
  getCircleStationCentroid,
  getRepeaterById,
  listExternalIdsForCircle,
  listRepeatersForCircle,
  updateRepeaterRecord,
  type RepeaterRow,
} from './repository.js';

const MAX_IMPORT_CANDIDATES = 100;

export class RepeaterDirectoryService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async list(circleId: string, userId: string): Promise<RepeaterResponse[]> {
    const { role } = await this.requireCircleAccess(circleId, userId);
    const rows = await listRepeatersForCircle(this.db, circleId);
    return rows.map((row) => this.shape(row, userId, role));
  }

  /** Any active member may add -- members are the ones who know what they can hear. */
  async create(
    circleId: string,
    userId: string,
    input: CreateRepeaterInput,
    requestId: string,
  ): Promise<RepeaterResponse> {
    const { role } = await this.requireCircleAccess(circleId, userId);
    const row = await createRepeaterRecord(this.db, circleId, userId, input);
    await this.audit.record({
      actorUserId: userId,
      action: 'repeater.created',
      targetType: 'repeater',
      targetId: row.id,
      requestId,
      metadata: { circleId, service: input.service },
    });
    return this.shape(row, userId, role);
  }

  /** Coordinators curate anything; members may edit entries they added. */
  async update(
    repeaterId: string,
    userId: string,
    input: UpdateRepeaterInput,
    requestId: string,
  ): Promise<RepeaterResponse> {
    const row = await this.requireRepeater(repeaterId);
    const role = await this.requireCanManage(row, userId);
    const updated = await updateRepeaterRecord(this.db, repeaterId, input);
    if (!updated) throw new NotFoundError('Repeater not found.');
    await this.audit.record({
      actorUserId: userId,
      action: 'repeater.updated',
      targetType: 'repeater',
      targetId: repeaterId,
      requestId,
      metadata: { fields: Object.keys(input) },
    });
    return this.shape(updated, userId, role);
  }

  async remove(repeaterId: string, userId: string, requestId: string): Promise<void> {
    const row = await this.requireRepeater(repeaterId);
    await this.requireCanManage(row, userId);
    await deleteRepeaterRecord(this.db, repeaterId);
    await this.audit.record({
      actorUserId: userId,
      action: 'repeater.deleted',
      targetType: 'repeater',
      targetId: repeaterId,
      requestId,
      metadata: { circleId: row.circleId, name: row.name },
    });
  }

  /**
   * RepeaterBook proxy search: queries the whole state (cached ~24h
   * upstream of this call), filters by distance to the Circle's station
   * centroid, and marks entries already in the directory. The centroid is
   * consumed server-side only.
   */
  async importSearch(
    circleId: string,
    userId: string,
    query: RepeaterImportSearchQuery,
  ): Promise<RepeaterImportSearchResponse> {
    await this.requireCircleAccess(circleId, userId);
    if (!this.config.repeaterbook.isConfigured) {
      return { configured: false, state: null, candidates: [] };
    }

    const centroid = await getCircleStationCentroid(this.db, circleId);
    let state = query.state ?? null;
    if (!state) {
      if (!centroid) {
        throw new BadRequestError(
          'No member station has coordinates yet -- specify a state to search, or add station locations.',
        );
      }
      state = await reverseGeocodeState(centroid.latitude, centroid.longitude, {
        contactEmail: this.config.geocoding.contactEmail,
      });
      if (!state) {
        throw new BadRequestError('Could not determine the state for this Circle; specify one explicitly.');
      }
    }

    const entries = await fetchStateRepeaters(state, query.service, {
      appToken: this.config.repeaterbook.appToken,
      contactEmail: this.config.geocoding.contactEmail,
    });
    const alreadyImported = await listExternalIdsForCircle(this.db, circleId, query.service);

    const withDistance = entries.map((entry) => ({
      entry,
      distanceKm:
        centroid && entry.latitude !== null && entry.longitude !== null
          ? haversineKm(centroid.latitude, centroid.longitude, entry.latitude, entry.longitude)
          : null,
    }));

    const filtered = withDistance
      .filter(({ entry, distanceKm }) => entry.operational && (distanceKm === null || distanceKm <= query.radiusKm))
      .sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE))
      .slice(0, MAX_IMPORT_CANDIDATES);

    return {
      configured: true,
      state,
      candidates: filtered.map(({ entry, distanceKm }) => ({
        externalId: entry.externalId,
        service: query.service,
        name: entry.name,
        callsign: entry.callsign,
        outputFrequencyMhz: entry.outputFrequencyMhz,
        offsetOrInput: entry.offsetOrInput,
        tone: entry.tone,
        latitude: entry.latitude,
        longitude: entry.longitude,
        areaLabel: entry.areaLabel,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm),
        alreadyImported: alreadyImported.has(entry.externalId),
      })),
    };
  }

  /**
   * Imports selected candidates by re-resolving them server-side from the
   * (cached) RepeaterBook state export, so clients cannot forge repeater
   * data through the import path.
   */
  async importSelected(
    circleId: string,
    userId: string,
    input: ImportRepeatersInput & { state?: string },
    requestId: string,
  ): Promise<RepeaterResponse[]> {
    const { role } = await this.requireCircleAccess(circleId, userId);
    if (!this.config.repeaterbook.isConfigured) {
      throw new ConflictError('Repeater import is not configured on this server.');
    }
    if (!input.state) {
      throw new BadRequestError('state is required (returned by the import search).');
    }

    const entries = await fetchStateRepeaters(input.state, input.service, {
      appToken: this.config.repeaterbook.appToken,
      contactEmail: this.config.geocoding.contactEmail,
    });
    const byExternalId = new Map<string, RepeaterBookEntry>(entries.map((e) => [e.externalId, e]));
    const alreadyImported = await listExternalIdsForCircle(this.db, circleId, input.service);

    const created: RepeaterResponse[] = [];
    for (const externalId of input.externalIds) {
      if (alreadyImported.has(externalId)) continue;
      const entry = byExternalId.get(externalId);
      if (!entry) {
        throw new BadRequestError(`Unknown repeater ${externalId} -- run the import search again.`);
      }
      const row = await createRepeaterRecord(this.db, circleId, userId, {
        service: input.service,
        name: entry.name,
        callsign: entry.callsign ?? undefined,
        outputFrequencyMhz: entry.outputFrequencyMhz,
        offsetOrInput: entry.offsetOrInput ?? undefined,
        tone: entry.tone ?? undefined,
        latitude: entry.latitude ?? undefined,
        longitude: entry.longitude ?? undefined,
        areaLabel: entry.areaLabel ?? undefined,
        status: 'active',
        source: 'repeaterbook',
        externalId: entry.externalId,
      });
      created.push(this.shape(row, userId, role));
    }

    await this.audit.record({
      actorUserId: userId,
      action: 'repeater.imported',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { service: input.service, count: created.length },
    });
    return created;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireCircleAccess(circleId: string, userId: string) {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, userId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    return { circle, role };
  }

  private async requireRepeater(repeaterId: string): Promise<RepeaterRow> {
    const row = await getRepeaterById(this.db, repeaterId);
    if (!row) throw new NotFoundError('Repeater not found.');
    return row;
  }

  private async requireCanManage(row: RepeaterRow, userId: string) {
    const role = await getViewerRole(this.db, row.circleId, userId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    if (role !== 'coordinator' && row.addedBy !== userId) {
      throw new ForbiddenError('Only Circle coordinators (or the member who added it) may change this repeater.');
    }
    return role;
  }

  private shape(row: RepeaterRow, userId: string, role: 'coordinator' | 'member' | null): RepeaterResponse {
    return {
      id: row.id,
      circleId: row.circleId,
      service: row.service as RepeaterServiceKind,
      name: row.name,
      callsign: row.callsign,
      outputFrequencyMhz: row.outputFrequencyMhz,
      offsetOrInput: row.offsetOrInput,
      tone: row.tone,
      latitude: row.latitude,
      longitude: row.longitude,
      areaLabel: row.areaLabel,
      source: row.source as 'manual' | 'repeaterbook',
      status: row.status as RepeaterStatus,
      notes: row.notes,
      viewerCanManage: role === 'coordinator' || row.addedBy === userId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
