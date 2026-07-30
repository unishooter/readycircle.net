import pino from 'pino';

export interface LoggerOptions {
  level: string;
  /** development | test | staging | production */
  appEnv: string;
  /** Logical module name, e.g. "api", "worker", "stations" */
  module: string;
}

/**
 * Fields that must never be written to logs, even accidentally via a
 * generic `.info({ ...body })` call. `redact` paths are checked against the
 * shape of objects passed to the logger.
 */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'password',
  'sessionSecret',
  'session_secret',
  'sessionToken',
  'session_token',
  'accessToken',
  'access_token',
  'idToken',
  'id_token',
  'refreshToken',
  'refresh_token',
  '*.latitude',
  '*.longitude',
  '*.precise_latitude',
  '*.precise_longitude',
];

/**
 * Plain pino options, deliberately separated from `createLogger` so
 * frameworks that build their own logger instance (Fastify's `logger`
 * config accepts these same options) can share this configuration without
 * a type mismatch between a pre-built pino instance and the framework's
 * own logger generics.
 */
export function buildPinoOptions(options: LoggerOptions): pino.LoggerOptions {
  const { level, appEnv, module } = options;
  const isDevelopment = appEnv === 'development';

  return {
    level,
    base: { module },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname,module' },
        }
      : undefined,
  };
}

export function createLogger(options: LoggerOptions) {
  return pino(buildPinoOptions(options));
}

export type Logger = ReturnType<typeof createLogger>;
