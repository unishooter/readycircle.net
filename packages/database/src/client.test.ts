import { describe, expect, it, vi } from 'vitest';
import { isPasswordAuthFailure } from './client.js';

describe('isPasswordAuthFailure', () => {
  it('detects Postgres SQLSTATE 28P01', () => {
    expect(isPasswordAuthFailure({ code: '28P01', message: 'password authentication failed' })).toBe(
      true,
    );
  });

  it('detects the common error message when code is absent', () => {
    expect(
      isPasswordAuthFailure(new Error('password authentication failed for user "readycircle_admin"')),
    ).toBe(true);
  });

  it('does not treat unrelated errors as auth failures', () => {
    expect(isPasswordAuthFailure(new Error('connection refused'))).toBe(false);
    expect(isPasswordAuthFailure({ code: '57P01', message: 'terminating connection' })).toBe(false);
    expect(isPasswordAuthFailure(null)).toBe(false);
  });
});

describe('createManagedDatabase options', () => {
  it('rejects when neither connectionString nor secretArn is provided', async () => {
    const { createManagedDatabase } = await import('./client.js');
    await expect(createManagedDatabase({})).rejects.toThrow(/connectionString or secretArn/);
  });

  it('requires region when using secretArn without an injectable cache', async () => {
    const { createManagedDatabase } = await import('./client.js');
    await expect(
      createManagedDatabase({ secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db' }),
    ).rejects.toThrow(/region is required/);
  });

  it('uses the injectable password cache and does not call live AWS', async () => {
    const { createManagedDatabase } = await import('./client.js');
    const getConnectionConfig = vi.fn(async () => ({
      host: '127.0.0.1',
      port: 1,
      database: 'readycircle',
      username: 'admin',
      password: 'unused',
    }));
    const cache = {
      getConnectionConfig,
      getPassword: vi.fn(async () => 'unused'),
      invalidate: vi.fn(),
    };

    // Construction reaches postgres.js with ssl/host options; connecting is
    // deferred until a query, so this must not hit Secrets Manager or RDS.
    const handle = await createManagedDatabase({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
      passwordCache: cache,
      max: 1,
    });

    expect(getConnectionConfig).toHaveBeenCalledTimes(1);
    await handle.close();
  });
});
