export { createS3Client, putDocument, getDocument } from './s3.js';
export type { S3ClientOptions, PutDocumentInput, GetDocumentResult } from './s3.js';

export { createSqsClient, receiveMessages, deleteMessage, sendMessage } from './sqs.js';
export type { SqsClientOptions, ReceiveOptions, SqsMessage } from './sqs.js';

export { createSecretsManagerClient, getSecretString } from './secrets-manager.js';
export type { SecretsManagerClientOptions } from './secrets-manager.js';

export {
  parseRdsSecretString,
  fetchRdsConnectionConfig,
  createRdsPasswordCache,
  RdsSecretError,
} from './rds-secret.js';
export type { RdsConnectionConfig, RdsPasswordCache, RdsPasswordCacheOptions } from './rds-secret.js';
