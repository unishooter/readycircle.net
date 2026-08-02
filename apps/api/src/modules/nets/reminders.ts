import type { FastifyBaseLogger } from 'fastify';

/**
 * Seam for future net reminders (ADR 0011). The intended production shape
 * is a scheduled worker job (`net.reminder`) that emails Circle members via
 * SES ahead of each computed occurrence -- neither the scheduler nor SES
 * is wired up yet, so the only implementation logs and does nothing.
 */
export interface NetReminderService {
  /** Called when a session opens, so members could be notified the net is on the air. */
  sessionOpened(input: { netId: string; netName: string; circleId: string; sessionId: string }): Promise<void>;
}

export class NoopNetReminderService implements NetReminderService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  sessionOpened(input: { netId: string; netName: string; circleId: string; sessionId: string }): Promise<void> {
    this.logger.debug({ ...input }, 'net reminders not configured; skipping session-opened notification');
    return Promise.resolve();
  }
}
