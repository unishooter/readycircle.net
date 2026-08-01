import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@readycircle/database';
import type { AdvisoryProvider, DocumentStore } from '@readycircle/plan-engine';
import { generatePlanDocument, generatePlanVersion } from '@readycircle/plan-engine';
import type { Logger } from '@readycircle/observability';
import { createPlanGenerationHandler } from './plan-generation.js';
import { createDocumentGenerationHandler } from './document-generation.js';

vi.mock('@readycircle/plan-engine', () => ({
  generatePlanVersion: vi.fn().mockResolvedValue({ status: 'draft' }),
  generatePlanDocument: vi.fn().mockResolvedValue({ status: 'ready', storageKey: 'k' }),
}));

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const db = {} as Database;
const advisoryProvider = {} as AdvisoryProvider;
const documentStore = {} as DocumentStore;

const VERSION_ID = '4f5b2b4e-8a3c-4d1e-9f6a-2b7c8d9e0f1a';
const USER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('plan-generation handler', () => {
  const handler = createPlanGenerationHandler({ db, advisoryProvider });

  it('parses the payload and invokes the plan engine', async () => {
    await handler({ planVersionId: VERSION_ID, requestedByUserId: USER_ID }, { logger });
    expect(generatePlanVersion).toHaveBeenCalledWith({
      db,
      planVersionId: VERSION_ID,
      advisoryProvider,
      logger,
    });
  });

  it('rejects malformed payloads without invoking the engine', async () => {
    await expect(handler({ planVersionId: 'not-a-uuid' }, { logger })).rejects.toThrow();
    expect(generatePlanVersion).not.toHaveBeenCalled();
  });
});

describe('document-generation handler', () => {
  const handler = createDocumentGenerationHandler({ db, documentStore });

  it('parses the payload (defaulting format to pdf) and invokes the plan engine', async () => {
    await handler({ planVersionId: VERSION_ID }, { logger });
    expect(generatePlanDocument).toHaveBeenCalledWith({
      db,
      planVersionId: VERSION_ID,
      format: 'pdf',
      store: documentStore,
      logger,
    });
  });

  it('rejects unsupported formats', async () => {
    await expect(handler({ planVersionId: VERSION_ID, format: 'docx' }, { logger })).rejects.toThrow();
    expect(generatePlanDocument).not.toHaveBeenCalled();
  });
});
