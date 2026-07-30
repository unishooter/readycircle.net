import { auditEvents, type Database } from '@readycircle/database';
import { sanitizeAuditMetadata } from '@readycircle/domain';
import type { AuditAction } from '@readycircle/contracts';

export interface AuditEventInput {
  actorUserId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  requestId: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * The only code path allowed to write to `audit_events`. Routing every
 * write through `sanitizeAuditMetadata` guarantees precise coordinates and
 * other sensitive values never land in audit metadata, even if a caller
 * forgets to scrub its own input.
 */
export class AuditService {
  constructor(private readonly db: Database) {}

  async record(event: AuditEventInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      requestId: event.requestId,
      metadata: event.metadata ? (sanitizeAuditMetadata(event.metadata) as Record<string, unknown>) : null,
    });
  }
}
