import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface S3ClientOptions {
  region: string;
  /** Overrides the endpoint; used for local development against S3-compatible emulators. */
  endpoint?: string;
}

export function createS3Client(options: S3ClientOptions): S3Client {
  return new S3Client({ region: options.region, endpoint: options.endpoint });
}

export interface PutDocumentInput {
  bucket: string;
  key: string;
  body: Uint8Array | string;
  contentType: string;
}

/**
 * Thin wrapper so business modules (e.g. document generation) depend on this
 * narrow interface instead of importing the AWS SDK directly.
 */
export async function putDocument(client: S3Client, input: PutDocumentInput): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}
