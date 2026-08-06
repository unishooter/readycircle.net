import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient, getSecretString } from './secrets-manager.js';

export interface RdsConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export class RdsSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RdsSecretError';
  }
}

/**
 * Parses the JSON shape written by RDS-managed Secrets Manager secrets
 * (`username`, `password`, `host`, `port`, `dbname` or `database`).
 */
export function parseRdsSecretString(raw: string): RdsConnectionConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RdsSecretError('RDS secret value is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RdsSecretError('RDS secret value must be a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const host = requireNonEmptyString(record, 'host');
  const username = requireNonEmptyString(record, 'username');
  const password = requireString(record, 'password');
  const database =
    optionalNonEmptyString(record, 'dbname') ?? optionalNonEmptyString(record, 'database');
  if (!database) {
    throw new RdsSecretError('RDS secret is missing required field "dbname" (or "database").');
  }

  const portRaw = record.port;
  let port: number;
  if (typeof portRaw === 'number' && Number.isInteger(portRaw) && portRaw > 0) {
    port = portRaw;
  } else if (typeof portRaw === 'string' && /^\d+$/.test(portRaw.trim())) {
    port = Number(portRaw.trim());
  } else {
    throw new RdsSecretError('RDS secret field "port" must be a positive integer.');
  }

  return { host, port, database, username, password };
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new RdsSecretError(`RDS secret is missing required string field "${key}".`);
  }
  return value;
}

function requireNonEmptyString(record: Record<string, unknown>, key: string): string {
  const value = requireString(record, key).trim();
  if (!value) {
    throw new RdsSecretError(`RDS secret field "${key}" must not be empty.`);
  }
  return value;
}

function optionalNonEmptyString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function fetchRdsConnectionConfig(
  secretArn: string,
  region: string,
  client: SecretsManagerClient = createSecretsManagerClient({ region }),
): Promise<RdsConnectionConfig> {
  const secretString = await getSecretString(client, secretArn);
  if (!secretString) {
    throw new RdsSecretError(`Secrets Manager secret "${secretArn}" has no SecretString payload.`);
  }
  return parseRdsSecretString(secretString);
}

export interface RdsPasswordCacheOptions {
  secretArn: string;
  region: string;
  /** How long a fetched password may be reused before re-fetching. Default 60s. */
  ttlMs?: number;
  /** Injectable for tests; defaults to live Secrets Manager fetch. */
  fetchConfig?: (secretArn: string, region: string) => Promise<RdsConnectionConfig>;
}

export interface RdsPasswordCache {
  /** Full connection fields (host/port/db/user) plus the current password. */
  getConnectionConfig(): Promise<RdsConnectionConfig>;
  /** Async password callback suitable for postgres.js `password`. */
  getPassword(): Promise<string>;
  /** Drop the cached secret so the next fetch hits Secrets Manager. */
  invalidate(): void;
}

/**
 * Short-lived cache around `fetchRdsConnectionConfig` so new pool connections
 * do not hammer Secrets Manager, with an explicit invalidate path for
 * password-authentication failures after RDS rotation.
 */
export function createRdsPasswordCache(options: RdsPasswordCacheOptions): RdsPasswordCache {
  const ttlMs = options.ttlMs ?? 60_000;
  const fetchConfig = options.fetchConfig ?? fetchRdsConnectionConfig;
  let cached: { config: RdsConnectionConfig; expiresAt: number } | null = null;
  let inFlight: Promise<RdsConnectionConfig> | null = null;

  async function load(): Promise<RdsConnectionConfig> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.config;
    }
    if (!inFlight) {
      inFlight = fetchConfig(options.secretArn, options.region)
        .then((config) => {
          cached = { config, expiresAt: Date.now() + ttlMs };
          return config;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  return {
    getConnectionConfig: () => load(),
    getPassword: async () => (await load()).password,
    invalidate: () => {
      cached = null;
    },
  };
}
