import type { AppConfig } from '@readycircle/config';
import type { AprsIsConfig } from '@readycircle/contracts';
import type { Database } from '@readycircle/database';
import type { Logger } from '@readycircle/observability';
import { AprsIsListener } from './aprs-is-listener.js';
import {
  aprsConnectionIdentity,
  isAprsConnectionActive,
  loadEffectiveAprsIsConfig,
} from './aprs-settings.js';
import { loadCallsignMap, upsertStationAprsPosition } from './repository.js';

const DEFAULT_POLL_INTERVAL_MS = 60_000;

export interface AprsIsSupervisorOptions {
  db: Database;
  config: AppConfig;
  logger: Logger;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; defaults to constructing a real AprsIsListener. */
  createListener?: (aprs: AprsIsConfig) => { run(): Promise<void>; stop(): void };
}

/**
 * Polls effective APRS-IS settings and starts/stops/reconnects the listener
 * when admin (or env) config changes -- no worker restart required.
 */
export class AprsIsSupervisor {
  private stopped = false;
  private listener: { run(): Promise<void>; stop(): void } | null = null;
  private listenerRun: Promise<void> | null = null;
  private currentIdentity: string | null = null;
  private readonly pollIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly createListener: (aprs: AprsIsConfig) => { run(): Promise<void>; stop(): void };

  constructor(private readonly options: AprsIsSupervisorOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.createListener =
      options.createListener ??
      ((aprs) =>
        new AprsIsListener({
          host: aprs.host,
          port: aprs.port,
          loginCallsign: aprs.callsign,
          passcode: aprs.passcode,
          logger: options.logger,
          loadCallsignMap: () => loadCallsignMap(options.db),
          onPosition: ({ stationId, position, rawLine }) =>
            upsertStationAprsPosition(options.db, {
              stationId,
              position,
              rawLine,
              heardAt: position.timestamp ?? new Date(),
            }),
        }));
  }

  stop(): void {
    this.stopped = true;
    this.stopListener();
  }

  async run(): Promise<void> {
    this.options.logger.info({ pollIntervalMs: this.pollIntervalMs }, 'aprs-is supervisor starting');
    while (!this.stopped) {
      try {
        await this.reconcile();
      } catch (error) {
        this.options.logger.error({ err: error }, 'aprs-is supervisor reconcile failed');
      }
      if (this.stopped) break;
      await this.sleep(this.pollIntervalMs);
    }
    this.stopListener();
    this.options.logger.info('aprs-is supervisor stopped');
  }

  /** Exposed for tests. */
  async reconcile(): Promise<void> {
    const aprs = await loadEffectiveAprsIsConfig(this.options.db, this.options.config);
    const active = isAprsConnectionActive(aprs);
    const identity = aprsConnectionIdentity(aprs);

    if (!active) {
      if (this.listener) {
        this.options.logger.info('aprs-is disabled or callsign empty; stopping listener');
        this.stopListener();
      }
      return;
    }

    if (this.listener && this.currentIdentity === identity) {
      return;
    }

    if (this.listener) {
      this.options.logger.info({ host: aprs.host, port: aprs.port, callsign: aprs.callsign }, 'aprs-is config changed; reconnecting');
      this.stopListener();
    } else {
      this.options.logger.info({ host: aprs.host, port: aprs.port, callsign: aprs.callsign }, 'aprs-is starting listener');
    }

    const listener = this.createListener(aprs);
    this.listener = listener;
    this.currentIdentity = identity;
    this.listenerRun = listener.run().catch((error) => {
      this.options.logger.error({ err: error }, 'aprs-is listener exited unexpectedly');
    });
  }

  private stopListener(): void {
    if (!this.listener) return;
    this.listener.stop();
    this.listener = null;
    this.listenerRun = null;
    this.currentIdentity = null;
  }
}
