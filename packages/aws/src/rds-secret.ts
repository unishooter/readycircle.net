import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient, getSecretString } from './secrets-manager.js';

export interface RdsConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Fields present in the Secrets Manager JSON. Full RDS-managed secrets include
 * host/port/dbname; many app secrets only store username + password.
 */
export interface RdsSecretFields {
  username: string;
  password: string;
  host?: string;
  port?: number;
  database?: string;
}

export interface PostgresEndpoint {
  host: string;
  port: number;
  database: string;
}

export class RdsSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RdsSecretError';
  }
}

/**
 * Parses Secrets Manager JSON for DB credentials.
 * Requires `username` + `password`. `host` / `port` / `dbname|database` are
 * optional -- when omitted, callers merge an endpoint from `DATABASE_URL`.
 */
export function parseRdsSecretString(raw: string): RdsSecretFields {
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
  const username = requireNonEmptyString(record, 'username');
  const password = requireString(record, 'password');
  const host = optionalNonEmptyString(record, 'host') ?? undefined;
  const database =
    optionalNonEmptyString(record, 'dbname') ?? optionalNonEmptyString(record, 'database') ?? undefined;

  let port: number | undefined;
  if (record.port !== undefined && record.port !== null && record.port !== '') {
    port = parsePort(record.port, true);
  }

  return { username, password, host, port, database };
}

/**
 * Extracts host / port / database from a Postgres URL. Username and password
 * in the URL are ignored -- Secrets Manager is the source of truth for those.
 */
export function parsePostgresEndpoint(connectionString: string): PostgresEndpoint {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new RdsSecretError('DATABASE_URL is not a valid URL.');
  }

  if (!url.hostname) {
    throw new RdsSecretError('DATABASE_URL is missing a host.');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!database) {
    throw new RdsSecretError('DATABASE_URL is missing a database name (path).');
  }

  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port <= 0) {
    throw new RdsSecretError('DATABASE_URL has an invalid port.');
  }

  return { host: url.hostname, port, database };
}

/**
 * Merges secret fields with an optional DATABASE_URL endpoint. Secret values
 * win when present; password always comes from the secret.
 */
export function resolveRdsConnectionConfig(
  secret: RdsSecretFields,
  endpointFallback?: PostgresEndpoint | null,
): RdsConnectionConfig {
  const host = secret.host ?? endpointFallback?.host;
  const port = secret.port ?? endpointFallback?.port;
  const database = secret.database ?? endpointFallback?.database;

  if (!host || !port || !database) {
    throw new RdsSecretError(
      'Database endpoint incomplete: secret has username/password but is missing host/port/dbname. ' +
        'Keep DATABASE_URL for host/port/database (password in the URL is ignored), or use a full RDS-managed secret.',
    );
  }

  return {
    host,
    port,
    database,
    username: secret.username,
    password: secret.password,
  };
}

function parsePort(portRaw: unknown, required: boolean): number | undefined {
  if (typeof portRaw === 'number' && Number.isInteger(portRaw) && portRaw > 0) {
    return portRaw;
  }
  if (typeof portRaw === 'string' && /^\d+$/.test(portRaw.trim())) {
    return Number(portRaw.trim());
  }
  if (required) {
    throw new RdsSecretError('RDS secret field "port" must be a positive integer.');
  }
  return undefined;
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

export async function fetchRdsSecretFields(
  secretArn: string,
  region: string,
  client: SecretsManagerClient = createSecretsManagerClient({ region }),
): Promise<RdsSecretFields> {
  const secretString = await getSecretString(client, secretArn);
  if (!secretString) {
    throw new RdsSecretError(`Secrets Manager secret "${secretArn}" has no SecretString payload.`);
  }
  return parseRdsSecretString(secretString);
}

/** @deprecated Prefer fetchRdsSecretFields + resolveRdsConnectionConfig. */
export async function fetchRdsConnectionConfig(
  secretArn: string,
  region: string,
  client: SecretsManagerClient = createSecretsManagerClient({ region }),
  endpointFallback?: PostgresEndpoint | null,
): Promise<RdsConnectionConfig> {
  const fields = await fetchRdsSecretFields(secretArn, region, client);
  return resolveRdsConnectionConfig(fields, endpointFallback);
}

export interface RdsPasswordCacheOptions {
  secretArn: string;
  region: string;
  /** Host/port/database from DATABASE_URL when the secret is credentials-only. */
  endpointFallback?: PostgresEndpoint | null;
  /** How long a fetched password may be reused before re-fetching. Default 60s. */
  ttlMs?: number;
  /** Injectable for tests; defaults to live Secrets Manager fetch. */
  fetchFields?: (secretArn: string, region: string) => Promise<RdsSecretFields>;
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
 * Short-lived cache around Secrets Manager fetches so new pool connections
 * do not hammer SM, with an explicit invalidate path for password-
 * authentication failures after RDS rotation.
 */
export function createRdsPasswordCache(options: RdsPasswordCacheOptions): RdsPasswordCache {
  const ttlMs = options.ttlMs ?? 60_000;
  const fetchFields = options.fetchFields ?? fetchRdsSecretFields;
  let cached: { config: RdsConnectionConfig; expiresAt: number } | null = null;
  let inFlight: Promise<RdsConnectionConfig> | null = null;

  async function load(): Promise<RdsConnectionConfig> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.config;
    }
    if (!inFlight) {
      inFlight = fetchFields(options.secretArn, options.region)
        .then((fields) => resolveRdsConnectionConfig(fields, options.endpointFallback))
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
