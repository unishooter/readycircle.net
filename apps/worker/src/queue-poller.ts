import type { SQSClient } from '@aws-sdk/client-sqs';
import { deleteMessage, receiveMessages, type SqsMessage } from '@readycircle/aws';
import type { Logger } from '@readycircle/observability';
import { jobMessageEnvelopeSchema } from './jobs/types.js';
import type { JobHandlerRegistry } from './jobs/registry.js';

export interface QueuePollerOptions {
  name: string;
  queueUrl: string;
  client: SQSClient;
  registry: JobHandlerRegistry;
  logger: Logger;
  waitTimeSeconds?: number;
  visibilityTimeoutSeconds?: number;
}

/**
 * Long-polls a single SQS queue and dispatches each message's `jobType` to
 * the matching handler in the registry. Messages that fail to parse or
 * process are left on the queue (not deleted) so SQS's own redrive/DLQ
 * policy handles retries; only handlers that succeed are acknowledged.
 */
export class QueuePoller {
  private stopped = false;

  constructor(private readonly options: QueuePollerOptions) {}

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<void> {
    const { name, queueUrl, client, logger } = this.options;
    logger.info({ queue: name }, 'queue poller starting');

    while (!this.stopped) {
      let messages: SqsMessage[] = [];
      try {
        messages = await receiveMessages(client, {
          queueUrl,
          waitTimeSeconds: this.options.waitTimeSeconds ?? 10,
          visibilityTimeoutSeconds: this.options.visibilityTimeoutSeconds ?? 30,
        });
      } catch (error) {
        logger.error({ err: error, queue: name }, 'failed to receive messages, backing off');
        await sleep(5000);
        continue;
      }

      for (const message of messages) {
        if (this.stopped) break;
        await this.processMessage(message);
      }
    }

    logger.info({ queue: name }, 'queue poller stopped');
  }

  private async processMessage(message: SqsMessage): Promise<void> {
    const { name, queueUrl, client, registry, logger } = this.options;

    if (!message.Body || !message.ReceiptHandle) {
      logger.warn({ queue: name, messageId: message.MessageId }, 'received message without body or receipt handle, skipping');
      return;
    }

    let envelope;
    try {
      envelope = jobMessageEnvelopeSchema.parse(JSON.parse(message.Body));
    } catch (error) {
      logger.error({ err: error, queue: name, messageId: message.MessageId }, 'message failed envelope validation, leaving on queue');
      return;
    }

    const handler = registry.get(envelope.jobType);
    if (!handler) {
      logger.error({ queue: name, jobType: envelope.jobType, messageId: message.MessageId }, 'no handler registered for job type, leaving on queue');
      return;
    }

    try {
      await handler(envelope.payload, { logger });
      await deleteMessage(client, queueUrl, message.ReceiptHandle);
      logger.info({ queue: name, jobType: envelope.jobType, messageId: message.MessageId }, 'job processed successfully');
    } catch (error) {
      logger.error({ err: error, queue: name, jobType: envelope.jobType, messageId: message.MessageId }, 'job handler failed, leaving on queue for retry');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
