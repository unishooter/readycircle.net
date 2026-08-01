import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { ConfigError, loadConfig } from '@readycircle/config';
import { createDatabase, pingDatabase } from '@readycircle/database';
import { createLogger } from '@readycircle/observability';
import { createSqsClient } from '@readycircle/aws';
import { createAdvisoryProvider, createDocumentStore } from '@readycircle/plan-engine';
import { JobHandlerRegistry } from './jobs/registry.js';
import { createPlanGenerationHandler, PLAN_GENERATION_JOB_TYPE } from './jobs/handlers/plan-generation.js';
import { createDocumentGenerationHandler, DOCUMENT_GENERATION_JOB_TYPE } from './jobs/handlers/document-generation.js';
import { QueuePoller } from './queue-poller.js';

// See apps/api/src/index.ts for why this is safe in production too.
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

  const logger = createLogger({ level: config.logLevel, appEnv: config.appEnv, module: 'worker' });

  const { db, close: closeDatabase } = createDatabase(config.databaseUrl);
  try {
    await pingDatabase(db);
    logger.info('database connection verified');
  } catch (error) {
    logger.fatal({ err: error }, 'failed to connect to database');
    process.exit(1);
  }

  const advisoryProvider = createAdvisoryProvider({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
  });
  const documentStore = createDocumentStore({
    bucket: config.aws.documentBucket,
    region: config.aws.region,
    storagePath: config.documents.storagePath,
  });

  const registry = new JobHandlerRegistry();
  registry.register(PLAN_GENERATION_JOB_TYPE, createPlanGenerationHandler({ db, advisoryProvider }));
  registry.register(DOCUMENT_GENERATION_JOB_TYPE, createDocumentGenerationHandler({ db, documentStore }));
  logger.info(
    { jobTypes: registry.registeredJobTypes, openaiConfigured: config.openai.isConfigured, model: config.openai.model },
    'job handlers registered',
  );

  const sqsClient = createSqsClient({ region: config.aws.region });

  const pollers: QueuePoller[] = [];
  const queueDefinitions = [
    { name: 'plan-generation', queueUrl: config.aws.planQueueUrl },
    { name: 'document-generation', queueUrl: config.aws.documentQueueUrl },
  ];

  for (const queue of queueDefinitions) {
    if (!queue.queueUrl) {
      logger.warn({ queue: queue.name }, 'no queue URL configured, skipping poller (expected in local development)');
      continue;
    }
    pollers.push(new QueuePoller({ name: queue.name, queueUrl: queue.queueUrl, client: sqsClient, registry, logger }));
  }

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });

  if (pollers.length === 0) {
    logger.warn('worker started with no active queue pollers; idling. Configure AWS_SQS_*_QUEUE_URL to enable processing.');
  }

  const runPromises = pollers.map((poller) => poller.run());
  logger.info({ appEnv: config.appEnv, activeQueues: pollers.length }, 'ReadyCircle worker started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    pollers.forEach((poller) => poller.stop());
    try {
      await Promise.race([Promise.all(runPromises), sleep(15000)]);
      await closeDatabase();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await Promise.all(runPromises);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
