import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import type { AprsPositionResponse } from '@readycircle/contracts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { getAprsEnabled } from '../admin/effective-settings.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import { listAprsPositionsForCircle } from './repository.js';

export class AprsPositionsService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  /** Any active Circle member may view the live map -- same gate as repeaters/contacts. */
  async list(circleId: string, userId: string): Promise<AprsPositionResponse[]> {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, userId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');

    // Auth first, then feature gate -- disabled APRS yields an empty list, not a leak of membership.
    if (!(await getAprsEnabled(this.db, this.config))) return [];

    const rows = await listAprsPositionsForCircle(this.db, circleId);
    return rows.map((row) => ({
      stationId: row.stationId,
      stationName: row.stationName,
      callsign: row.callsign,
      latitude: row.latitude,
      longitude: row.longitude,
      symbolTable: row.symbolTable,
      symbolCode: row.symbolCode,
      comment: row.comment,
      heardAt: row.heardAt.toISOString(),
    }));
  }
}
