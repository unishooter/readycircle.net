import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@readycircle/observability';
import { AprsIsListener, type AprsSocketLike, type CallsignMap } from './aprs-is-listener.js';

class FakeSocket extends EventEmitter implements AprsSocketLike {
  written: string[] = [];
  destroyed = false;

  write(data: string): void {
    this.written.push(data);
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('close');
  }
}

function silentLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  } as unknown as Logger;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Harness {
  listener: AprsIsListener;
  sockets: FakeSocket[];
  logger: Logger;
  sleepCalls: number[];
  triggerFilterRefresh: () => void;
  intervalMs: number | null;
  onPosition: ReturnType<typeof vi.fn>;
  loadCallsignMap: ReturnType<typeof vi.fn>;
}

function buildHarness(overrides: {
  loadCallsignMap?: () => Promise<CallsignMap>;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
} = {}): Harness {
  const sockets: FakeSocket[] = [];
  const socketFactory = vi.fn(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });

  const sleepCalls: number[] = [];
  const sleep = vi.fn((ms: number) => {
    sleepCalls.push(ms);
    return Promise.resolve();
  });

  let intervalHandler: (() => void) | null = null;
  let intervalMs: number | null = null;
  const setIntervalFn = vi.fn((handler: () => void, ms: number) => {
    intervalHandler = handler;
    intervalMs = ms;
    return 1 as unknown as NodeJS.Timeout;
  });
  const clearIntervalFn = vi.fn();

  const onPosition = vi.fn().mockResolvedValue(undefined);
  const loadCallsignMap = vi.fn(overrides.loadCallsignMap ?? (async () => new Map([['KI5ABC-9', 'station-1']])));

  const logger = silentLogger();
  const listener = new AprsIsListener({
    host: 'test.aprs2.net',
    port: 14580,
    loginCallsign: 'KI5ABC-9',
    passcode: '12345',
    logger,
    loadCallsignMap,
    onPosition,
    socketFactory,
    sleep,
    setIntervalFn,
    clearIntervalFn,
    initialReconnectDelayMs: overrides.initialReconnectDelayMs ?? 100,
    maxReconnectDelayMs: overrides.maxReconnectDelayMs ?? 800,
    filterRefreshIntervalMs: 60000,
  });

  return {
    listener,
    sockets,
    logger,
    sleepCalls,
    intervalMs,
    onPosition,
    loadCallsignMap,
    triggerFilterRefresh: () => {
      if (!intervalHandler) throw new Error('filter refresh interval was never registered');
      intervalHandler();
    },
  };
}

describe('AprsIsListener', () => {
  it('sends the login line with the budlist filter derived from known callsigns on connect', async () => {
    const harness = buildHarness({
      loadCallsignMap: async () => new Map([['KI5ABC-9', 'station-1'], ['N0CALL', 'station-2']]),
    });
    const runPromise = harness.listener.run();
    await flush();

    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    expect(socket.written).toEqual(['user KI5ABC-9 pass 12345 vers ReadyCircle 0.1 filter b/KI5ABC-9/N0CALL\r\n']);

    harness.listener.stop();
    await runPromise;
  });

  it('logs in with a filter matching nothing when no station callsigns are known yet', async () => {
    const harness = buildHarness({ loadCallsignMap: async () => new Map() });
    const runPromise = harness.listener.run();
    await flush();

    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    expect(socket.written[0]).toContain('filter b/RC0NONE');

    harness.listener.stop();
    await runPromise;
  });

  it('buffers multi-chunk data and only parses complete lines', async () => {
    const harness = buildHarness();
    const runPromise = harness.listener.run();
    await flush();
    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    socket.emit('data', 'KI5ABC-9>APRS:!3327.50N/0');
    await flush();
    expect(harness.onPosition).not.toHaveBeenCalled();

    socket.emit('data', '9708.00W>test\n');
    await flush();

    expect(harness.onPosition).toHaveBeenCalledTimes(1);
    expect(harness.onPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        stationId: 'station-1',
        rawLine: 'KI5ABC-9>APRS:!3327.50N/09708.00W>test',
      }),
    );

    harness.listener.stop();
    await runPromise;
  });

  it('ignores "#"-prefixed server comment/heartbeat lines', async () => {
    const harness = buildHarness();
    const runPromise = harness.listener.run();
    await flush();
    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    socket.emit('data', '# aprsc 2.1.4-g...\n');
    await flush();

    expect(harness.onPosition).not.toHaveBeenCalled();

    harness.listener.stop();
    await runPromise;
  });

  it('calls onPosition once per matching packet and ignores packets from unknown callsigns', async () => {
    const harness = buildHarness({ loadCallsignMap: async () => new Map([['KI5ABC-9', 'station-1']]) });
    const runPromise = harness.listener.run();
    await flush();
    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    socket.emit(
      'data',
      'N0CALL>APRS:!4903.50N/07201.75W-not tracked\nKI5ABC-9>APRS:!3327.50N/09708.00W>tracked\n',
    );
    await flush();

    expect(harness.onPosition).toHaveBeenCalledTimes(1);
    expect(harness.onPosition.mock.calls[0]![0].stationId).toBe('station-1');

    harness.listener.stop();
    await runPromise;
  });

  it('sends an updated filter on the live connection when the known callsign list changes, without reconnecting', async () => {
    let call = 0;
    const harness = buildHarness({
      loadCallsignMap: async () => {
        call += 1;
        return call === 1 ? new Map([['KI5ABC-9', 'station-1']]) : new Map([['N0CALL', 'station-2']]);
      },
    });
    const runPromise = harness.listener.run();
    await flush();
    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();
    expect(socket.written).toEqual(['user KI5ABC-9 pass 12345 vers ReadyCircle 0.1 filter b/KI5ABC-9\r\n']);

    harness.triggerFilterRefresh();
    await flush();

    expect(socket.written).toContain('#filter b/N0CALL\r\n');
    expect(harness.sockets).toHaveLength(1); // no reconnect

    // The refreshed callsign map should now be used for matching.
    socket.emit('data', 'N0CALL>APRS:!4903.50N/07201.75W-now tracked\n');
    await flush();
    expect(harness.onPosition).toHaveBeenCalledTimes(1);
    expect(harness.onPosition.mock.calls[0]![0].stationId).toBe('station-2');

    harness.listener.stop();
    await runPromise;
  });

  it('does not resend the filter when the callsign list is unchanged', async () => {
    const harness = buildHarness({ loadCallsignMap: async () => new Map([['KI5ABC-9', 'station-1']]) });
    const runPromise = harness.listener.run();
    await flush();
    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    const writesAfterLogin = socket.written.length;
    harness.triggerFilterRefresh();
    await flush();

    expect(socket.written).toHaveLength(writesAfterLogin);

    harness.listener.stop();
    await runPromise;
  });

  it('reconnects with exponential backoff after socket errors, then resets the delay after a clean session', async () => {
    const harness = buildHarness({ initialReconnectDelayMs: 100, maxReconnectDelayMs: 800 });
    const runPromise = harness.listener.run();
    await flush();

    harness.sockets[0]!.emit('error', new Error('boom 1'));
    await flush();
    expect(harness.sleepCalls).toEqual([100]);

    harness.sockets[1]!.emit('error', new Error('boom 2'));
    await flush();
    expect(harness.sleepCalls).toEqual([100, 200]);

    // A clean connect+close (no error) resets the backoff delay -- the next
    // reconnect sleep uses the initial delay again instead of continuing to
    // double (which would have been 400).
    harness.sockets[2]!.emit('connect');
    await flush();
    harness.sockets[2]!.emit('close');
    await flush();
    expect(harness.sleepCalls).toEqual([100, 200, 100]);

    harness.listener.stop();
    await runPromise;
  });

  it('stop() destroys the active socket and cleanly ends run()', async () => {
    const harness = buildHarness();
    const runPromise = harness.listener.run();
    await flush();
    const socket = harness.sockets[0]!;
    socket.emit('connect');
    await flush();

    harness.listener.stop();
    await runPromise;

    expect(socket.destroyed).toBe(true);
    expect(harness.sockets).toHaveLength(1);
  });
});
