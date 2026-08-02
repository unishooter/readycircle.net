import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import { SessionManager } from '@readycircle/auth';
import { buildPinoOptions, generateRequestId, REQUEST_ID_HEADER } from '@readycircle/observability';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerSessionPlugin } from './plugins/session.js';
import { AuditService } from './modules/audit/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { sessionRoutes } from './modules/session/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { stationRoutes } from './modules/stations/routes.js';
import { circleRoutes } from './modules/circles/routes.js';
import { membershipRoutes } from './modules/memberships/routes.js';
import { geocodingRoutes } from './modules/geocoding/routes.js';
import { planRoutes } from './modules/plans/routes.js';
import { netRoutes } from './modules/nets/routes.js';
import { repeaterRoutes } from './modules/repeaters/routes.js';
import { inviteRoutes } from './modules/invites/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { contactRoutes } from './modules/contacts/routes.js';
import { createJobDispatcher, type JobDispatcher } from './modules/plans/dispatcher.js';
import { createDocumentStore, type DocumentStore } from '@readycircle/plan-engine';

export interface BuildServerOptions {
  config: AppConfig;
  db: Database;
  /** Test seam: replaces the SQS / in-process plan job dispatcher. */
  planJobDispatcher?: JobDispatcher;
  /** Test seam: replaces the S3 / local-disk plan document store. */
  planDocumentStore?: DocumentStore;
}

export function buildServer({ config, db, planJobDispatcher, planDocumentStore }: BuildServerOptions): FastifyInstance {
  const app = Fastify({
    logger: buildPinoOptions({ level: config.logLevel, appEnv: config.appEnv, module: 'api' }),
    disableRequestLogging: false,
    // The ALB terminates TLS and forwards X-Forwarded-* headers; only trust
    // them when we know a proxy is actually in front of us.
    trustProxy: config.isProduction,
    genReqId: (request) => {
      const header = request.headers[REQUEST_ID_HEADER];
      return typeof header === 'string' && header.length > 0 ? header : generateRequestId();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    return payload;
  });

  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('sessionManager', new SessionManager(db, config.sessionSecret));
  app.decorate('auditService', new AuditService(db));
  app.decorate('planJobDispatcher', planJobDispatcher ?? createJobDispatcher(config, db, app.log));
  app.decorate(
    'planDocumentStore',
    planDocumentStore ??
      createDocumentStore({
        bucket: config.aws.documentBucket,
        region: config.aws.region,
        storagePath: config.documents.storagePath,
      }),
  );

  registerErrorHandler(app);

  // The `secret` enables signed cookies, used only for the short-lived
  // OAuth state cookie (see modules/auth/oauth-state.ts) -- the long-lived
  // `rc_session` cookie stays an opaque, unsigned token validated against
  // the `sessions` table instead.
  app.register(cookie, { secret: config.sessionSecret });
  app.register(cors, { origin: config.appBaseUrl, credentials: true });
  app.register(swagger, {
    openapi: {
      info: { title: 'ReadyCircle API', version: '0.1.0' },
      servers: [{ url: '/api/v1' }],
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: '/docs' });

  registerSessionPlugin(app, app.sessionManager);

  app.register(healthRoutes, { prefix: '/health' });
  app.register(sessionRoutes, { prefix: '/api/v1' });
  if (config.cognito.isConfigured) {
    app.register(authRoutes, { prefix: '/api/v1' });
  }
  app.register(userRoutes, { prefix: '/api/v1' });
  app.register(stationRoutes, { prefix: '/api/v1' });
  app.register(circleRoutes, { prefix: '/api/v1' });
  app.register(membershipRoutes, { prefix: '/api/v1' });
  app.register(geocodingRoutes, { prefix: '/api/v1' });
  app.register(planRoutes, { prefix: '/api/v1' });
  app.register(netRoutes, { prefix: '/api/v1' });
  app.register(repeaterRoutes, { prefix: '/api/v1' });
  app.register(inviteRoutes, { prefix: '/api/v1' });
  app.register(adminRoutes, { prefix: '/api/v1' });
  app.register(contactRoutes, { prefix: '/api/v1' });

  return app;
}
