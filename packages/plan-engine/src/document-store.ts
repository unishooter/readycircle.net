import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createS3Client, getDocument, putDocument } from '@readycircle/aws';

export interface StoredDocument {
  body: Uint8Array;
  contentType: string;
}

/**
 * Narrow storage interface for rendered plan documents. Production uses S3;
 * local development falls back to a directory on disk so document
 * generation works without any AWS resources. Downloads always go through
 * the API (which reads from this store), so the frontend never needs to
 * know which backend is in use.
 */
export interface DocumentStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredDocument | null>;
}

export class S3DocumentStore implements DocumentStore {
  private readonly client;

  constructor(
    private readonly bucket: string,
    region: string,
  ) {
    this.client = createS3Client({ region });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await putDocument(this.client, { bucket: this.bucket, key, body, contentType });
  }

  async get(key: string): Promise<StoredDocument | null> {
    return getDocument(this.client, { bucket: this.bucket, key });
  }
}

export class LocalDocumentStore implements DocumentStore {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    // Storage keys are always server-generated, but keep the traversal guard
    // anyway since this resolves paths on the host filesystem.
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error(`Invalid document key: ${key}`);
    }
    return resolved;
  }

  async put(key: string, body: Uint8Array, _contentType: string): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async get(key: string): Promise<StoredDocument | null> {
    try {
      const body = await readFile(this.resolve(key));
      return { body: new Uint8Array(body), contentType: guessContentType(key) };
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

function guessContentType(key: string): string {
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

export interface DocumentStoreOptions {
  /** S3 bucket name; when blank the local store is used instead. */
  bucket: string;
  region: string;
  /** Base directory for the local fallback store. */
  storagePath: string;
}

export function createDocumentStore(options: DocumentStoreOptions): DocumentStore {
  if (options.bucket) {
    return new S3DocumentStore(options.bucket, options.region);
  }
  return new LocalDocumentStore(options.storagePath);
}
