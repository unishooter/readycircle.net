import { z } from 'zod';

/**
 * Central, validated environment configuration shared by the API and worker
 * processes. Nothing in this package should read `process.env` directly
 * outside of `loadConfig`, so every other module receives a fully-typed,
 * already-validated `AppConfig`.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : value.trim().toLowerCase() === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().int().positive().default(3000),

  // Prefer DATABASE_SECRET_ARN in production (Secrets Manager JSON with at
  // least username/password). DATABASE_URL is the local/dev path, and in
  // production may still supply host/port/database when the secret is
  // credentials-only (URL password is ignored whenever the ARN is set).
  // At least one of the two must be set.
  DATABASE_URL: z.string().default(''),
  DATABASE_SECRET_ARN: z.string().default(''),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters long'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_DOCUMENT_BUCKET: z.string().default(''),
  AWS_SQS_PLAN_QUEUE_URL: z.string().default(''),
  AWS_SQS_DOCUMENT_QUEUE_URL: z.string().default(''),

  COGNITO_USER_POOL_ID: z.string().default(''),
  COGNITO_CLIENT_ID: z.string().default(''),
  COGNITO_CLIENT_SECRET: z.string().default(''),
  COGNITO_DOMAIN: z.string().default(''),
  COGNITO_REDIRECT_URI: z.string().default(''),

  DEV_AUTH_ENABLED: booleanFromString.default(false),
  DEV_AUTH_UNSAFE_OVERRIDE: booleanFromString.default(false),

  // Gates brand-new account creation behind a valid Circle invite link.
  // Existing users can always sign back in regardless of this setting. An
  // admin can override this at runtime via the platform_settings table; this
  // env value is only the fallback when no override is set.
  INVITE_ONLY_ACCESS: booleanFromString.default(false),

  // Gates the APRS live map (and worker ingestion of matched positions).
  // Independent of APRS_IS_CALLSIGN (which is still required for the worker
  // to connect). An admin can override this at runtime via platform_settings.
  APRS_ENABLED: booleanFromString.default(true),

  // OpenStreetMap Nominatim's usage policy requires requests to identify the
  // application with a contact address (https://operations.osmfoundation.org/policies/nominatim/).
  // Defaults to a generic ReadyCircle address so geocoding still works
  // out of the box in development; set a real monitored address in production.
  GEOCODING_CONTACT_EMAIL: z.string().default('support@readycircle.net'),

  // RepeaterBook export API (repeater import search). Optional in every
  // environment: without a token the import UI reports "not configured" and
  // manual repeater entry still works. Request a free app token from
  // RepeaterBook; their policy also requires a descriptive User-Agent.
  REPEATERBOOK_APP_TOKEN: z.string().default(''),

  // AI-assisted plan generation. The key is required in production (plan
  // generation is a core feature there); in development a missing key simply
  // makes generation fail with a clear error rather than blocking startup.
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-5.6-terra'),

  // Where rendered plan documents are written when AWS_S3_DOCUMENT_BUCKET is
  // not configured (local development). Relative paths resolve against the
  // process working directory.
  DOCUMENT_STORAGE_PATH: z.string().default('.data/documents'),

  // Persistent APRS-IS TCP listener (apps/worker) for live station
  // tracking. Off by default: the worker only connects when
  // APRS_IS_CALLSIGN is set, since APRS-IS requires an authenticated
  // (even if receive-only) login. PASSCODE=-1 means read-only access,
  // which is intentional -- this feature never transmits.
  APRS_IS_HOST: z.string().default('rotate.aprs2.net'),
  APRS_IS_PORT: z.coerce.number().int().positive().default(14580),
  APRS_IS_CALLSIGN: z.string().default(''),
  APRS_IS_PASSCODE: z.string().default('-1'),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: RawEnv['NODE_ENV'];
  appEnv: RawEnv['APP_ENV'];
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  appBaseUrl: string;
  apiPort: number;
  /**
   * Postgres URL for local/dev, or production endpoint fallback (host/port/
   * database) when `databaseSecretArn` points at a credentials-only secret.
   * When the ARN is set, the URL password is never used for auth.
   */
  databaseUrl: string | null;
  /**
   * ARN/name of the Secrets Manager secret. When set, username/password are
   * resolved from SM at connection time (rotation-safe).
   */
  databaseSecretArn: string | null;
  sessionSecret: string;
  logLevel: RawEnv['LOG_LEVEL'];
  aws: {
    region: string;
    documentBucket: string;
    planQueueUrl: string;
    documentQueueUrl: string;
  };
  cognito: {
    userPoolId: string;
    clientId: string;
    clientSecret: string;
    domain: string;
    redirectUri: string;
    isConfigured: boolean;
  };
  devAuth: {
    /** Whether dev-auth routes should actually be registered. */
    enabled: boolean;
    unsafeOverrideUsed: boolean;
  };
  /** Env-level default; the effective value may be overridden via platform_settings. */
  inviteOnlyAccess: boolean;
  /** Env-level default for APRS live tracking; overridable via platform_settings. */
  aprsEnabled: boolean;
  geocoding: {
    contactEmail: string;
  };
  repeaterbook: {
    appToken: string;
    isConfigured: boolean;
  };
  openai: {
    apiKey: string;
    model: string;
    isConfigured: boolean;
  };
  documents: {
    /** Local filesystem fallback used when no S3 bucket is configured. */
    storagePath: string;
  };
  aprs: {
    host: string;
    port: number;
    callsign: string;
    passcode: string;
    /** Whether the worker should start the APRS-IS listener at all. */
    isConfigured: boolean;
  };
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/**
 * Parses and validates `process.env` (or a supplied source) into a typed
 * `AppConfig`. Throws `ConfigError` with a human-readable summary when
 * required values are missing or invalid, which is intentional: the process
 * should fail fast at startup rather than limp along with bad configuration.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment configuration:\n${formatIssues(parsed.error)}`);
  }

  const env = parsed.data;
  const isProduction = env.APP_ENV === 'production';
  const databaseSecretArn = env.DATABASE_SECRET_ARN.trim() || null;
  const databaseUrl = env.DATABASE_URL.trim() || null;

  if (!databaseSecretArn && !databaseUrl) {
    throw new ConfigError(
      'Database configuration missing: set DATABASE_SECRET_ARN (production) or DATABASE_URL (local/dev).',
    );
  }

  if (isProduction && env.DEV_AUTH_ENABLED && !env.DEV_AUTH_UNSAFE_OVERRIDE) {
    throw new ConfigError(
      'DEV_AUTH_ENABLED=true is not allowed when APP_ENV=production. ' +
        'Set DEV_AUTH_UNSAFE_OVERRIDE=true only if you explicitly intend to expose ' +
        'development authentication in this environment (strongly discouraged).',
    );
  }

  if (isProduction) {
    const missing: string[] = [];
    if (!databaseSecretArn) {
      missing.push('DATABASE_SECRET_ARN (RDS-managed Secrets Manager secret; required in production)');
    }
    if (env.SESSION_SECRET.startsWith('dev-only')) {
      missing.push('SESSION_SECRET (still set to the development placeholder value)');
    }
    if (!env.AWS_S3_DOCUMENT_BUCKET) missing.push('AWS_S3_DOCUMENT_BUCKET');
    if (!env.AWS_SQS_PLAN_QUEUE_URL) missing.push('AWS_SQS_PLAN_QUEUE_URL');
    if (!env.AWS_SQS_DOCUMENT_QUEUE_URL) missing.push('AWS_SQS_DOCUMENT_QUEUE_URL');
    if (!env.COGNITO_USER_POOL_ID) missing.push('COGNITO_USER_POOL_ID');
    if (!env.COGNITO_CLIENT_ID) missing.push('COGNITO_CLIENT_ID');
    if (!env.COGNITO_CLIENT_SECRET) missing.push('COGNITO_CLIENT_SECRET');
    if (!env.COGNITO_DOMAIN) missing.push('COGNITO_DOMAIN');
    if (!env.COGNITO_REDIRECT_URI) missing.push('COGNITO_REDIRECT_URI');
    if (!env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
    if (missing.length > 0) {
      throw new ConfigError(
        `Missing required production configuration:\n${missing.map((m) => `  - ${m}`).join('\n')}`,
      );
    }
  }

  const devAuthEnabled = env.DEV_AUTH_ENABLED && (!isProduction || env.DEV_AUTH_UNSAFE_OVERRIDE);

  return {
    nodeEnv: env.NODE_ENV,
    appEnv: env.APP_ENV,
    isProduction,
    isDevelopment: env.APP_ENV === 'development',
    isTest: env.APP_ENV === 'test',
    appBaseUrl: env.APP_BASE_URL,
    apiPort: env.API_PORT,
    // Keep DATABASE_URL even when ARN is set: credentials-only secrets still
    // need host/port/database from the URL. Auth password always comes from SM.
    databaseUrl,
    databaseSecretArn,
    sessionSecret: env.SESSION_SECRET,
    logLevel: env.LOG_LEVEL,
    aws: {
      region: env.AWS_REGION,
      documentBucket: env.AWS_S3_DOCUMENT_BUCKET,
      planQueueUrl: env.AWS_SQS_PLAN_QUEUE_URL,
      documentQueueUrl: env.AWS_SQS_DOCUMENT_QUEUE_URL,
    },
    cognito: {
      userPoolId: env.COGNITO_USER_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
      clientSecret: env.COGNITO_CLIENT_SECRET,
      domain: env.COGNITO_DOMAIN,
      redirectUri: env.COGNITO_REDIRECT_URI,
      isConfigured: Boolean(
        env.COGNITO_USER_POOL_ID && env.COGNITO_CLIENT_ID && env.COGNITO_DOMAIN && env.COGNITO_REDIRECT_URI,
      ),
    },
    devAuth: {
      enabled: devAuthEnabled,
      unsafeOverrideUsed: isProduction && env.DEV_AUTH_UNSAFE_OVERRIDE,
    },
    inviteOnlyAccess: env.INVITE_ONLY_ACCESS,
    aprsEnabled: env.APRS_ENABLED,
    geocoding: {
      contactEmail: env.GEOCODING_CONTACT_EMAIL,
    },
    repeaterbook: {
      appToken: env.REPEATERBOOK_APP_TOKEN,
      isConfigured: Boolean(env.REPEATERBOOK_APP_TOKEN),
    },
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      isConfigured: Boolean(env.OPENAI_API_KEY),
    },
    documents: {
      storagePath: env.DOCUMENT_STORAGE_PATH,
    },
    aprs: {
      host: env.APRS_IS_HOST,
      port: env.APRS_IS_PORT,
      callsign: env.APRS_IS_CALLSIGN,
      passcode: env.APRS_IS_PASSCODE,
      isConfigured: Boolean(env.APRS_IS_CALLSIGN),
    },
  };
}
