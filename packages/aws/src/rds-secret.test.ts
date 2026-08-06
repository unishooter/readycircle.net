import { describe, expect, it, vi } from 'vitest';
import {
  createRdsPasswordCache,
  parseRdsSecretString,
  RdsSecretError,
  type RdsConnectionConfig,
} from './rds-secret.js';

const validSecret = {
  username: 'readycircle_admin',
  password: 's3cret!',
  host: 'db.example.us-east-1.rds.amazonaws.com',
  port: 5432,
  dbname: 'readycircle',
};

describe('parseRdsSecretString', () => {
  it('parses the RDS-managed JSON shape', () => {
    expect(parseRdsSecretString(JSON.stringify(validSecret))).toEqual({
      username: 'readycircle_admin',
      password: 's3cret!',
      host: 'db.example.us-east-1.rds.amazonaws.com',
      port: 5432,
      database: 'readycircle',
    });
  });

  it('accepts database as an alias for dbname and string ports', () => {
    expect(
      parseRdsSecretString(
        JSON.stringify({
          ...validSecret,
          dbname: undefined,
          database: 'appdb',
          port: '5432',
        }),
      ),
    ).toMatchObject({ database: 'appdb', port: 5432 });
  });

  it('keeps password characters as-is (field form, no URL encoding)', () => {
    const password = 'p@ss:word/with?special&chars=#';
    const parsed = parseRdsSecretString(JSON.stringify({ ...validSecret, password }));
    expect(parsed.password).toBe(password);
  });

  it('rejects missing required fields', () => {
    expect(() => parseRdsSecretString(JSON.stringify({ username: 'u' }))).toThrow(RdsSecretError);
    expect(() => parseRdsSecretString(JSON.stringify({ ...validSecret, host: '' }))).toThrow(
      /host/,
    );
    expect(() =>
      parseRdsSecretString(JSON.stringify({ ...validSecret, dbname: undefined, database: undefined })),
    ).toThrow(/dbname/);
  });

  it('rejects non-JSON payloads', () => {
    expect(() => parseRdsSecretString('not-json')).toThrow(RdsSecretError);
  });
});

describe('createRdsPasswordCache', () => {
  it('caches the password for the TTL and re-fetches after invalidate', async () => {
    let password = 'first';
    const fetchConfig = vi.fn(async (): Promise<RdsConnectionConfig> => ({
      host: 'db.example',
      port: 5432,
      database: 'readycircle',
      username: 'admin',
      password,
    }));

    const cache = createRdsPasswordCache({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
      region: 'us-east-1',
      ttlMs: 60_000,
      fetchConfig,
    });

    expect(await cache.getPassword()).toBe('first');
    expect(await cache.getPassword()).toBe('first');
    expect(fetchConfig).toHaveBeenCalledTimes(1);

    password = 'rotated';
    cache.invalidate();
    expect(await cache.getPassword()).toBe('rotated');
    expect(fetchConfig).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent fetches into one Secrets Manager call', async () => {
    let resolveFetch!: (value: RdsConnectionConfig) => void;
    const fetchConfig = vi.fn(
      () =>
        new Promise<RdsConnectionConfig>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const cache = createRdsPasswordCache({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
      region: 'us-east-1',
      fetchConfig,
    });

    const a = cache.getPassword();
    const b = cache.getPassword();
    expect(fetchConfig).toHaveBeenCalledTimes(1);

    resolveFetch({
      host: 'db.example',
      port: 5432,
      database: 'readycircle',
      username: 'admin',
      password: 'shared',
    });

    await expect(Promise.all([a, b])).resolves.toEqual(['shared', 'shared']);
    expect(fetchConfig).toHaveBeenCalledTimes(1);
  });
});
