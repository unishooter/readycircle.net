import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import type { SessionManager } from '@readycircle/auth';
import type { DocumentStore } from '@readycircle/plan-engine';
import type { AuditService } from './modules/audit/service.js';
import type { JobDispatcher } from './modules/plans/dispatcher.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: AppConfig;
    sessionManager: SessionManager;
    auditService: AuditService;
    planJobDispatcher: JobDispatcher;
    planDocumentStore: DocumentStore;
  }
}
