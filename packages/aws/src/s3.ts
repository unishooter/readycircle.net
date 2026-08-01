import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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

export interface GetDocumentResult {
  body: Uint8Array;
  contentType: string;
}

/** Returns null when the object does not exist, throws for other failures. */
export async function getDocument(
  client: S3Client,
  input: { bucket: string; key: string },
): Promise<GetDocumentResult | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
    const body = await result.Body?.transformToByteArray();
    if (!body) return null;
    return { body, contentType: result.ContentType ?? 'application/octet-stream' };
  } catch (error) {
    if (error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
      return null;
    }
    throw error;
  }
}
