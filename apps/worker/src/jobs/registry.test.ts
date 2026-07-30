import { describe, expect, it, vi } from 'vitest';
import { JobHandlerRegistry } from './registry.js';

describe('JobHandlerRegistry', () => {
  it('registers and retrieves handlers by job type', () => {
    const registry = new JobHandlerRegistry();
    const handler = vi.fn().mockResolvedValue(undefined);

    registry.register('plan.generate', handler);

    expect(registry.get('plan.generate')).toBe(handler);
    expect(registry.get('unknown.job')).toBeUndefined();
    expect(registry.registeredJobTypes).toEqual(['plan.generate']);
  });

  it('throws when registering the same job type twice', () => {
    const registry = new JobHandlerRegistry();
    registry.register('plan.generate', vi.fn());

    expect(() => registry.register('plan.generate', vi.fn())).toThrow(/already registered/);
  });
});
