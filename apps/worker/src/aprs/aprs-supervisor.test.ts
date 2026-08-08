import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@readycircle/config';
import type { Logger } from '@readycircle/observability';
import { AprsIsSupervisor } from './aprs-supervisor.js';
import * as aprsSettings from './aprs-settings.js';

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

const baseConfig = {
  aprsEnabled: true,
  aprs: { host: 'rotate.aprs2.net', port: 14580, callsign: '', passcode: '-1', isConfigured: false },
} as AppConfig;

describe('AprsIsSupervisor', () => {
  it('starts a listener when effective config becomes active', async () => {
    vi.spyOn(aprsSettings, 'loadEffectiveAprsIsConfig').mockResolvedValue({
      enabled: true,
      host: 'rotate.aprs2.net',
      port: 14580,
      callsign: 'KI5ABC',
      passcode: '-1',
    });

    const stop = vi.fn();
    const run = vi.fn().mockResolvedValue(undefined);
    const createListener = vi.fn(() => ({ run, stop }));

    const supervisor = new AprsIsSupervisor({
      db: {} as never,
      config: baseConfig,
      logger: silentLogger(),
      createListener,
    });

    await supervisor.reconcile();
    expect(createListener).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();

    supervisor.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('stops the listener when callsign is cleared', async () => {
    const load = vi.spyOn(aprsSettings, 'loadEffectiveAprsIsConfig');
    load.mockResolvedValueOnce({
      enabled: true,
      host: 'rotate.aprs2.net',
      port: 14580,
      callsign: 'KI5ABC',
      passcode: '-1',
    });

    const stop = vi.fn();
    const createListener = vi.fn(() => ({ run: vi.fn().mockResolvedValue(undefined), stop }));
    const supervisor = new AprsIsSupervisor({
      db: {} as never,
      config: baseConfig,
      logger: silentLogger(),
      createListener,
    });

    await supervisor.reconcile();
    expect(createListener).toHaveBeenCalledOnce();

    load.mockResolvedValueOnce({
      enabled: true,
      host: 'rotate.aprs2.net',
      port: 14580,
      callsign: '',
      passcode: '-1',
    });
    await supervisor.reconcile();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('reconnects when host/callsign identity changes', async () => {
    const load = vi.spyOn(aprsSettings, 'loadEffectiveAprsIsConfig');
    load.mockResolvedValueOnce({
      enabled: true,
      host: 'rotate.aprs2.net',
      port: 14580,
      callsign: 'KI5ABC',
      passcode: '-1',
    });

    const stopA = vi.fn();
    const stopB = vi.fn();
    const createListener = vi
      .fn()
      .mockReturnValueOnce({ run: vi.fn().mockResolvedValue(undefined), stop: stopA })
      .mockReturnValueOnce({ run: vi.fn().mockResolvedValue(undefined), stop: stopB });

    const supervisor = new AprsIsSupervisor({
      db: {} as never,
      config: baseConfig,
      logger: silentLogger(),
      createListener,
    });

    await supervisor.reconcile();
    load.mockResolvedValueOnce({
      enabled: true,
      host: 'rotate.aprs2.net',
      port: 14580,
      callsign: 'N0CALL',
      passcode: '-1',
    });
    await supervisor.reconcile();

    expect(stopA).toHaveBeenCalledOnce();
    expect(createListener).toHaveBeenCalledTimes(2);
    supervisor.stop();
  });
});
