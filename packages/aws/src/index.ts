export { createS3Client, putDocument } from './s3.js';
export type { S3ClientOptions, PutDocumentInput } from './s3.js';

export { createSqsClient, receiveMessages, deleteMessage, sendMessage } from './sqs.js';
export type { SqsClientOptions, ReceiveOptions, SqsMessage } from './sqs.js';

export { createSecretsManagerClient, getSecretString } from './secrets-manager.js';
export type { SecretsManagerClientOptions } from './secrets-manager.js';
