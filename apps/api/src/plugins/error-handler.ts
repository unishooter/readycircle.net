import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ApiError } from '../lib/errors.js';

/**
 * Every error response, regardless of source, is shaped the same way:
 * `{ error: { code, message, requestId, details? } }`. This is what lets
 * the frontend and tests rely on one error contract instead of special-
 * casing validation errors, thrown ApiErrors, and unexpected exceptions.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof ApiError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, code: error.code }, 'api error');
      } else {
        request.log.warn({ err: { message: error.message }, code: error.code }, 'handled api error');
      }
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId, details: error.details },
      });
      return;
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      reply.status(400).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed.',
          requestId,
          details: error.validation.map((issue) => ({
            path: issue.instancePath || issue.schemaPath,
            message: issue.message ?? 'Invalid value',
          })),
        },
      });
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    reply.status(500).send({
      error: { code: 'internal_error', message: 'An unexpected error occurred.', requestId },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: 'Route not found.', requestId: request.id },
    });
  });
}
