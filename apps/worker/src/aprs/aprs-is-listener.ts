import { connect as netConnect } from 'node:net';
import type { Logger } from '@readycircle/observability';
import { buildAprsIsFilter, parseAprsPosition, type ParsedAprsPosition } from '@readycircle/aprs';

/**
 * Minimal socket surface the listener depends on -- deliberately narrower
 * than `net.Socket` so unit tests can pass a plain `EventEmitter`-based
 * stub instead of opening a real TCP connection.
 */
export interface AprsSocketLike {
  on(event: 'connect', listener: () => void): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  write(data: string): unknown;
  destroy(): unknown;
}

export type AprsSocketFactory = (host: string, port: number) => AprsSocketLike;

/** callsign (uppercase) -> stationId. */
export type CallsignMap = Map<string, string>;

export interface AprsPositionHeard {
  stationId: string;
  position: ParsedAprsPosition;
  rawLine: string;
}

export interface AprsIsListenerOptions {
  host: string;
  port: number;
  /** The worker's own callsign used to log in to APRS-IS. PASSCODE=-1 keeps this receive-only. */
  loginCallsign: string;
  passcode: string;
  logger: Logger;
  /** Loads the current callsign -> stationId map from the DB. */
  loadCallsignMap: () => Promise<CallsignMap>;
  /** Invoked once per matched, known-station position packet. */
  onPosition: (heard: AprsPositionHeard) => Promise<void>;
  socketFactory?: AprsSocketFactory;
  /** Base delay before reconnecting after an error/close; doubles on each consecutive failure up to maxReconnectDelayMs. */
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  /** How often to re-check the DB for a changed callsign list and push an updated filter on the live connection. */
  filterRefreshIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  setIntervalFn?: (handler: () => void, ms: number) => NodeJS.Timeout;
  clearIntervalFn?: (timer: NodeJS.Timeout) => void;
}

const DEFAULT_INITIAL_RECONNECT_DELAY_MS = 5000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_FILTER_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// A budlist filter naming a callsign that will never appear on the air --
// keeps the connection essentially silent (instead of the full firehose)
// while no member station has a callsign configured yet.
const EMPTY_FILTER = 'filter b/RC0NONE';

function defaultSocketFactory(host: string, port: number): AprsSocketLike {
  return netConnect({ host, port });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Persistent APRS-IS TCP listener. Mirrors `QueuePoller`'s `run()`/`stop()`
 * shape and catch-sleep-continue loop, but socket-based instead of
 * SQS-based, with reconnect backoff and a live, in-place filter update
 * instead of a fixed queue URL. See docs/decisions/0017-aprs-live-tracking.md.
 */
export class AprsIsListener {
  private stopped = false;
  private socket: AprsSocketLike | null = null;
  private filterRefreshTimer: NodeJS.Timeout | null = null;
  private currentFilter: string | null = null;
  private reconnectDelayMs: number;

  private readonly socketFactory: AprsSocketFactory;
  private readonly initialReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly filterRefreshIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly setIntervalFn: (handler: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearIntervalFn: (timer: NodeJS.Timeout) => void;

  constructor(private readonly options: AprsIsListenerOptions) {
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.initialReconnectDelayMs = options.initialReconnectDelayMs ?? DEFAULT_INITIAL_RECONNECT_DELAY_MS;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this.filterRefreshIntervalMs = options.filterRefreshIntervalMs ?? DEFAULT_FILTER_REFRESH_INTERVAL_MS;
    this.sleep = options.sleep ?? defaultSleep;
    this.setIntervalFn = options.setIntervalFn ?? ((handler, ms) => setInterval(handler, ms));
    this.clearIntervalFn = options.clearIntervalFn ?? ((timer) => clearInterval(timer));
    this.reconnectDelayMs = this.initialReconnectDelayMs;
  }

  stop(): void {
    this.stopped = true;
    this.stopFilterRefresh();
    this.socket?.destroy();
  }

  async run(): Promise<void> {
    const { logger, host, port } = this.options;
    logger.info({ host, port }, 'aprs-is listener starting');

    while (!this.stopped) {
      try {
        await this.connectOnce();
        // A clean close (server-initiated or our own stop()) resets backoff --
        // only consecutive failures should grow the delay.
        this.reconnectDelayMs = this.initialReconnectDelayMs;
      } catch (error) {
        logger.error({ err: error }, 'aprs-is connection error, reconnecting with backoff');
      }

      if (this.stopped) break;
      const delay = this.reconnectDelayMs;
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
      await this.sleep(delay);
    }

    logger.info('aprs-is listener stopped');
  }

  private connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory(this.options.host, this.options.port);
      this.socket = socket;
      let settled = false;
      let buffer = '';
      let knownCallsigns: CallsignMap = new Map();

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        this.stopFilterRefresh();
        if (this.socket === socket) this.socket = null;
        if (err) reject(err);
        else resolve();
      };

      socket.on('connect', () => {
        void (async () => {
          knownCallsigns = await this.options.loadCallsignMap();
          this.currentFilter = buildAprsIsFilter(Array.from(knownCallsigns.keys())) ?? EMPTY_FILTER;
          socket.write(this.buildLoginLine(this.currentFilter));
          this.options.logger.info({ callsignCount: knownCallsigns.size }, 'aprs-is connected and logged in');
          this.filterRefreshTimer = this.setIntervalFn(() => {
            void this.refreshFilter(socket)
              .then((updated) => {
                if (updated) knownCallsigns = updated;
              })
              .catch((error) => {
                this.options.logger.error({ err: error }, 'failed to refresh aprs-is filter');
              });
          }, this.filterRefreshIntervalMs);
        })().catch((error) => {
          this.options.logger.error({ err: error }, 'failed to initialize aprs-is session after connect');
        });
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          this.handleLine(rawLine, knownCallsigns).catch((error) => {
            this.options.logger.error({ err: error, rawLine }, 'failed to handle aprs-is line');
          });
        }
      });

      socket.on('error', (err) => finish(err));
      socket.on('close', () => finish());
    });
  }

  private buildLoginLine(filter: string): string {
    return `user ${this.options.loginCallsign} pass ${this.options.passcode} vers ReadyCircle 0.1 ${filter}\r\n`;
  }

  /** Returns the freshly-loaded callsign map when the filter changed, so the caller can keep matching packets against it; `null` when nothing changed. */
  private async refreshFilter(socket: AprsSocketLike): Promise<CallsignMap | null> {
    const callsigns = await this.options.loadCallsignMap();
    const nextFilter = buildAprsIsFilter(Array.from(callsigns.keys())) ?? EMPTY_FILTER;
    if (nextFilter === this.currentFilter) return null;
    this.currentFilter = nextFilter;
    // Per the APRS-IS protocol, a client changes its filter after login by
    // sending a line of the form "#filter <def>" on the live connection --
    // no reconnect required.
    socket.write(`#${nextFilter}\r\n`);
    this.options.logger.info({ callsignCount: callsigns.size }, 'aprs-is filter updated');
    return callsigns;
  }

  private stopFilterRefresh(): void {
    if (this.filterRefreshTimer) {
      this.clearIntervalFn(this.filterRefreshTimer);
      this.filterRefreshTimer = null;
    }
  }

  private async handleLine(rawLine: string, knownCallsigns: CallsignMap): Promise<void> {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith('#')) return;

    const position = parseAprsPosition(line);
    if (!position) return;

    const stationId = knownCallsigns.get(position.sourceCallsign);
    if (!stationId) return;

    await this.options.onPosition({ stationId, position, rawLine: line });
  }
}
