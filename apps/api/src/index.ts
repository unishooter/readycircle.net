import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { loadConfig, ConfigError } from '@readycircle/config';
import { createManagedDatabase, pingDatabase } from '@readycircle/database';
import { buildServer } from './server.js';

// Populates `process.env` from the repo-root `.env` file in local
// development. In production, systemd's `EnvironmentFile=` already
// populates `process.env` directly and no `.env` file exists at this path,
// so this is a harmless no-op there (dotenv never overrides variables that
// are already set, and silently does nothing if the file is missing).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Configuration error, refusing to start:\n${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  let dbHandle;
  try {
    dbHandle = await createManagedDatabase({
      connectionString: config.databaseUrl,
      secretArn: config.databaseSecretArn,
      region: config.aws.region,
    });
    await pingDatabase(dbHandle.db);
  } catch (error) {
    console.error('Failed to connect to database, refusing to start:', error);
    process.exit(1);
  }
  const { db, close } = dbHandle;
  const app = buildServer({ config, db });
  const logger = app.log;

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await close();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.apiPort, host: '0.0.0.0' });
    logger.info({ port: config.apiPort, appEnv: config.appEnv }, 'ReadyCircle API listening');
  } catch (error) {
    logger.fatal({ err: error }, 'failed to start server');
    process.exit(1);
  }
}

void main();
