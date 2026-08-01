import { createSqsClient, sendMessage } from '@readycircle/aws';
import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import type { PlanDocumentFormat } from '@readycircle/contracts';
import {
  createAdvisoryProvider,
  createDocumentStore,
  generatePlanDocument,
  generatePlanVersion,
  type AdvisoryProvider,
  type DocumentStore,
  type EngineLogger,
} from '@readycircle/plan-engine';

export interface PlanGenerationJob {
  planVersionId: string;
  requestedByUserId: string;
}

export interface DocumentGenerationJob {
  planVersionId: string;
  format: PlanDocumentFormat;
}

/**
 * Abstracts how plan/document jobs reach the generation code: SQS to the
 * worker in production, direct in-process execution in local development
 * (where no queues exist). Both paths run the same @readycircle/plan-engine
 * functions, so behavior only differs in *where* the work happens.
 */
export interface JobDispatcher {
  dispatchPlanGeneration(job: PlanGenerationJob): Promise<void>;
  dispatchDocumentGeneration(job: DocumentGenerationJob): Promise<void>;
}

export class SqsJobDispatcher implements JobDispatcher {
  private readonly client;

  constructor(
    region: string,
    private readonly planQueueUrl: string,
    private readonly documentQueueUrl: string,
  ) {
    this.client = createSqsClient({ region });
  }

  async dispatchPlanGeneration(job: PlanGenerationJob): Promise<void> {
    await sendMessage(this.client, this.planQueueUrl, { jobType: 'plan.generate', payload: job });
  }

  async dispatchDocumentGeneration(job: DocumentGenerationJob): Promise<void> {
    await sendMessage(this.client, this.documentQueueUrl, { jobType: 'document.generate', payload: job });
  }
}

/**
 * Runs generation in the API process, fire-and-forget, so the request that
 * triggered it can return immediately -- the frontend polls the version
 * status exactly as it would with the async SQS path.
 */
export class InProcessJobDispatcher implements JobDispatcher {
  constructor(
    private readonly db: Database,
    private readonly advisoryProvider: AdvisoryProvider,
    private readonly documentStore: DocumentStore,
    private readonly logger: EngineLogger,
  ) {}

  async dispatchPlanGeneration(job: PlanGenerationJob): Promise<void> {
    setImmediate(() => {
      void generatePlanVersion({
        db: this.db,
        planVersionId: job.planVersionId,
        advisoryProvider: this.advisoryProvider,
        logger: this.logger,
      }).catch((error: unknown) => {
        this.logger.error({ err: error, planVersionId: job.planVersionId }, 'in-process plan generation crashed');
      });
    });
  }

  async dispatchDocumentGeneration(job: DocumentGenerationJob): Promise<void> {
    setImmediate(() => {
      void generatePlanDocument({
        db: this.db,
        planVersionId: job.planVersionId,
        format: job.format,
        store: this.documentStore,
        logger: this.logger,
      }).catch((error: unknown) => {
        this.logger.error({ err: error, planVersionId: job.planVersionId }, 'in-process document generation crashed');
      });
    });
  }
}

export function createJobDispatcher(config: AppConfig, db: Database, logger: EngineLogger): JobDispatcher {
  if (config.aws.planQueueUrl && config.aws.documentQueueUrl) {
    return new SqsJobDispatcher(config.aws.region, config.aws.planQueueUrl, config.aws.documentQueueUrl);
  }
  const store = createDocumentStore({
    bucket: config.aws.documentBucket,
    region: config.aws.region,
    storagePath: config.documents.storagePath,
  });
  const advisoryProvider = createAdvisoryProvider({ apiKey: config.openai.apiKey, model: config.openai.model });
  return new InProcessJobDispatcher(db, advisoryProvider, store, logger);
}
