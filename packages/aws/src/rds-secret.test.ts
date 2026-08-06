import { describe, expect, it, vi } from 'vitest';
import {
  createRdsPasswordCache,
  parsePostgresEndpoint,
  parseRdsSecretString,
  resolveRdsConnectionConfig,
  RdsSecretError,
  type RdsSecretFields,
} from './rds-secret.js';

const fullSecret = {
  username: 'readycircle_admin',
  password: 's3cret!',
  host: 'db.example.us-east-1.rds.amazonaws.com',
  port: 5432,
  dbname: 'readycircle',
};

describe('parseRdsSecretString', () => {
  it('parses the full RDS-managed JSON shape', () => {
    expect(parseRdsSecretString(JSON.stringify(fullSecret))).toEqual({
      username: 'readycircle_admin',
      password: 's3cret!',
      host: 'db.example.us-east-1.rds.amazonaws.com',
      port: 5432,
      database: 'readycircle',
    });
  });

  it('parses credentials-only secrets (username + password)', () => {
    expect(parseRdsSecretString(JSON.stringify({ username: 'admin', password: 'pw' }))).toEqual({
      username: 'admin',
      password: 'pw',
      host: undefined,
      port: undefined,
      database: undefined,
    });
  });

  it('accepts database as an alias for dbname and string ports', () => {
    expect(
      parseRdsSecretString(
        JSON.stringify({
          ...fullSecret,
          dbname: undefined,
          database: 'appdb',
          port: '5432',
        }),
      ),
    ).toMatchObject({ database: 'appdb', port: 5432 });
  });

  it('keeps password characters as-is (field form, no URL encoding)', () => {
    const password = 'p@ss:word/with?special&chars=#';
    const parsed = parseRdsSecretString(JSON.stringify({ ...fullSecret, password }));
    expect(parsed.password).toBe(password);
  });

  it('rejects missing username/password', () => {
    expect(() => parseRdsSecretString(JSON.stringify({ username: 'u' }))).toThrow(RdsSecretError);
    expect(() => parseRdsSecretString(JSON.stringify({ password: 'p' }))).toThrow(/username/);
  });

  it('rejects non-JSON payloads', () => {
    expect(() => parseRdsSecretString('not-json')).toThrow(RdsSecretError);
  });
});

describe('parsePostgresEndpoint', () => {
  it('extracts host, port, and database from a URL', () => {
    expect(
      parsePostgresEndpoint('postgres://user:ignored@db.example:5432/readycircle'),
    ).toEqual({
      host: 'db.example',
      port: 5432,
      database: 'readycircle',
    });
  });

  it('defaults port to 5432 when omitted', () => {
    expect(parsePostgresEndpoint('postgres://user@db.example/readycircle').port).toBe(5432);
  });
});

describe('resolveRdsConnectionConfig', () => {
  it('uses secret endpoint fields when present', () => {
    expect(resolveRdsConnectionConfig(parseRdsSecretString(JSON.stringify(fullSecret)))).toEqual({
      username: 'readycircle_admin',
      password: 's3cret!',
      host: 'db.example.us-east-1.rds.amazonaws.com',
      port: 5432,
      database: 'readycircle',
    });
  });

  it('fills missing endpoint fields from DATABASE_URL fallback', () => {
    const secret = parseRdsSecretString(JSON.stringify({ username: 'admin', password: 'rotated' }));
    const endpoint = parsePostgresEndpoint(
      'postgres://stale:stale-password@prod.db.example:5432/readycircle',
    );
    expect(resolveRdsConnectionConfig(secret, endpoint)).toEqual({
      username: 'admin',
      password: 'rotated',
      host: 'prod.db.example',
      port: 5432,
      database: 'readycircle',
    });
  });

  it('rejects credentials-only secrets with no endpoint fallback', () => {
    const secret = parseRdsSecretString(JSON.stringify({ username: 'admin', password: 'pw' }));
    expect(() => resolveRdsConnectionConfig(secret)).toThrow(/endpoint incomplete/);
  });
});

describe('createRdsPasswordCache', () => {
  it('caches the password for the TTL and re-fetches after invalidate', async () => {
    let password = 'first';
    const fetchFields = vi.fn(async (): Promise<RdsSecretFields> => ({
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
      fetchFields,
    });

    expect(await cache.getPassword()).toBe('first');
    expect(await cache.getPassword()).toBe('first');
    expect(fetchFields).toHaveBeenCalledTimes(1);

    password = 'rotated';
    cache.invalidate();
    expect(await cache.getPassword()).toBe('rotated');
    expect(fetchFields).toHaveBeenCalledTimes(2);
  });

  it('merges credentials-only secret fetches with endpoint fallback', async () => {
    const fetchFields = vi.fn(async (): Promise<RdsSecretFields> => ({
      username: 'admin',
      password: 'from-sm',
    }));

    const cache = createRdsPasswordCache({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
      region: 'us-east-1',
      endpointFallback: { host: 'db.example', port: 5432, database: 'readycircle' },
      fetchFields,
    });

    await expect(cache.getConnectionConfig()).resolves.toEqual({
      username: 'admin',
      password: 'from-sm',
      host: 'db.example',
      port: 5432,
      database: 'readycircle',
    });
  });

  it('coalesces concurrent fetches into one Secrets Manager call', async () => {
    let resolveFetch!: (value: RdsSecretFields) => void;
    const fetchFields = vi.fn(
      () =>
        new Promise<RdsSecretFields>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const cache = createRdsPasswordCache({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
      region: 'us-east-1',
      fetchFields,
    });

    const a = cache.getPassword();
    const b = cache.getPassword();
    expect(fetchFields).toHaveBeenCalledTimes(1);

    resolveFetch({
      host: 'db.example',
      port: 5432,
      database: 'readycircle',
      username: 'admin',
      password: 'shared',
    });

    await expect(Promise.all([a, b])).resolves.toEqual(['shared', 'shared']);
    expect(fetchFields).toHaveBeenCalledTimes(1);
  });
});
