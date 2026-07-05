import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { ComponentAttachmentValidationError } from '@openmake/database';

/** Thrown for any deliberate, client-facing HTTP error with a known status code. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Thrown when a request body/params/query fails zod validation. */
export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

/** Parses `data` against `schema`, throwing a formatted ValidationError on failure. */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ValidationError(message);
  }
  return result.data;
}

interface PrismaKnownRequestErrorLike {
  code: string;
  message: string;
}

function isPrismaKnownRequestError(error: unknown): error is PrismaKnownRequestErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('P')
  );
}

/** Registers the central error handler: logs full errors server-side, never leaks details to clients. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);

    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }

    if (error instanceof ComponentAttachmentValidationError) {
      reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      return;
    }

    if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
      reply.status(409).send({ error: { code: 'CONFLICT', message: 'Resource already exists' } });
      return;
    }

    // Fastify's own validation errors (if any route uses schema validation) or
    // any other library error with a statusCode we can trust.
    const maybeStatusCode = (error as { statusCode?: number } | null)?.statusCode;
    if (typeof maybeStatusCode === 'number' && maybeStatusCode >= 400 && maybeStatusCode < 500) {
      reply.status(maybeStatusCode).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid request' },
      });
      return;
    }

    reply.status(500).send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}
