import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';

export interface SqsClientOptions {
  region: string;
  endpoint?: string;
}

export function createSqsClient(options: SqsClientOptions): SQSClient {
  return new SQSClient({ region: options.region, endpoint: options.endpoint });
}

export interface ReceiveOptions {
  queueUrl: string;
  maxMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeoutSeconds?: number;
}

export async function receiveMessages(client: SQSClient, options: ReceiveOptions): Promise<Message[]> {
  const result = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: options.queueUrl,
      MaxNumberOfMessages: options.maxMessages ?? 5,
      WaitTimeSeconds: options.waitTimeSeconds ?? 10,
      VisibilityTimeout: options.visibilityTimeoutSeconds ?? 30,
    }),
  );
  return result.Messages ?? [];
}

export async function deleteMessage(client: SQSClient, queueUrl: string, receiptHandle: string): Promise<void> {
  await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
}

export async function sendMessage(client: SQSClient, queueUrl: string, body: unknown): Promise<void> {
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(body) }));
}

export type { Message as SqsMessage };
