import type { Database } from '@readycircle/database';
import { canLogContact } from '@readycircle/domain';
import type { ContactResponse, LogContactInput } from '@readycircle/contracts';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { getNetById, getSessionById, listActiveMemberStations } from '../nets/repository.js';
import {
  deleteContact,
  getContactById,
  getStationIdsOwnedByUser,
  insertContact,
  listContactsByCircle,
  listContactsByStationIds,
  type ContactRow,
} from './repository.js';

function mapResponse(row: ContactRow, viewerUserId: string): ContactResponse {
  return {
    id: row.id,
    circleId: row.circleId,
    circleName: row.circleName,
    stationId: row.stationId,
    stationName: row.stationName,
    counterpartyStationId: row.counterpartyStationId,
    counterpartyStationName: row.counterpartyStationName,
    occurredAt: row.occurredAt.toISOString(),
    mode: row.mode as ContactResponse['mode'],
    channel: row.channel,
    signalRating: row.signalRating,
    notes: row.notes,
    netSessionId: row.netSessionId,
    recordedByUserId: row.recordedByUserId,
    recordedByDisplayName: row.recordedByDisplayName,
    viewerCanDelete: row.recordedByUserId === viewerUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class ContactService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async logContact(
    circleId: string,
    actingUserId: string,
    input: LogContactInput,
    requestId: string,
  ): Promise<ContactResponse> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');

    const role = await getViewerRole(this.db, circleId, actingUserId);
    if (!canLogContact(role)) {
      throw new ForbiddenError('Only active Circle members may log a contact.');
    }

    if (input.stationId === input.counterpartyStationId) {
      throw new BadRequestError('A station cannot log a contact with itself.');
    }

    const members = await listActiveMemberStations(this.db, circleId);
    const station = members.find((member) => member.stationId === input.stationId);
    if (!station) throw new BadRequestError('That station is not an active member of this Circle.');
    if (station.ownerId !== actingUserId) {
      throw new ForbiddenError('You may only log a contact for a station you own.');
    }

    const counterparty = members.find((member) => member.stationId === input.counterpartyStationId);
    if (!counterparty) {
      throw new BadRequestError('The other station is not an active member of this Circle.');
    }

    const occurredAt = new Date(input.occurredAt);
    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestError('occurredAt cannot be in the future.');
    }

    if (input.netSessionId) {
      const session = await getSessionById(this.db, input.netSessionId);
      if (!session) throw new BadRequestError('Net session not found.');
      const net = await getNetById(this.db, session.netId);
      if (!net || net.circleId !== circleId) {
        throw new BadRequestError('That net session does not belong to this Circle.');
      }
    }

    const contactId = await insertContact(this.db, {
      circleId,
      stationId: input.stationId,
      counterpartyStationId: input.counterpartyStationId,
      occurredAt,
      mode: input.mode,
      channel: input.channel ?? null,
      signalRating: input.signalRating ?? null,
      notes: input.notes ?? null,
      netSessionId: input.netSessionId ?? null,
      recordedByUserId: actingUserId,
    });

    await this.audit.record({
      actorUserId: actingUserId,
      action: 'contact.logged',
      targetType: 'circle',
      targetId: circleId,
      requestId,
      metadata: { contactId, stationId: input.stationId, counterpartyStationId: input.counterpartyStationId },
    });

    const row = await getContactById(this.db, contactId);
    if (!row) throw new NotFoundError('Contact not found after creation.');
    return mapResponse(row, actingUserId);
  }

  async listForCircle(circleId: string, viewerUserId: string): Promise<ContactResponse[]> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, viewerUserId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    const rows = await listContactsByCircle(this.db, circleId);
    return rows.map((row) => mapResponse(row, viewerUserId));
  }

  /** Contacts involving a station the viewer owns -- read access mirrors log access. */
  async listForStation(stationId: string, viewerUserId: string): Promise<ContactResponse[]> {
    const ownedIds = await getStationIdsOwnedByUser(this.db, viewerUserId);
    if (!ownedIds.includes(stationId)) {
      throw new ForbiddenError('You may only view contacts for a station you own.');
    }
    const rows = await listContactsByStationIds(this.db, [stationId]);
    return rows.map((row) => mapResponse(row, viewerUserId));
  }

  async listMine(viewerUserId: string): Promise<ContactResponse[]> {
    const ownedIds = await getStationIdsOwnedByUser(this.db, viewerUserId);
    const rows = await listContactsByStationIds(this.db, ownedIds);
    return rows.map((row) => mapResponse(row, viewerUserId));
  }

  async deleteContact(contactId: string, actingUserId: string, requestId: string): Promise<void> {
    const row = await getContactById(this.db, contactId);
    if (!row) throw new NotFoundError('Contact not found.');
    if (row.recordedByUserId !== actingUserId) {
      throw new ForbiddenError('You may only delete a contact you logged.');
    }
    await deleteContact(this.db, contactId);
    await this.audit.record({
      actorUserId: actingUserId,
      action: 'contact.deleted',
      targetType: 'circle',
      targetId: row.circleId,
      requestId,
      metadata: { contactId },
    });
  }
}
