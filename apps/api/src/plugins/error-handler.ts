import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { StandardError } from '@ainvr/contracts';

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.setErrorHandler(async (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = uuidv4();

    fastify.log.error(
      {
        err: error,
        correlationId,
        method: request.method,
        path: request.url,
      },
      'Error handling request'
    );

    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An internal server error occurred';
    let details: Record<string, unknown> | undefined;

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = {
        validationErrors: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      };
    }
    // Handle NotFound errors
    else if (error instanceof NotFoundError || (error as any).name === 'NotFoundError') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = error.message || 'Resource not found';
    }
    // Handle auth errors
    else if (error.message === 'Missing Authorization header' || error.message === 'Unauthorized') {
      statusCode = 401;
      code = 'UNAUTHORIZED';
      message = 'Missing or invalid authorization';
    } else if (error.message === 'Invalid or expired token' || error.message === 'Invalid Authorization header format') {
      statusCode = 401;
      code = 'UNAUTHORIZED';
      message = 'Invalid or expired authentication token';
    } else if (error.message === 'Forbidden' || (error as any).code === 'FORBIDDEN') {
      statusCode = 403;
      code = 'FORBIDDEN';
      message = 'Insufficient permissions';
    }
    // Handle Fastify errors
    else if ('statusCode' in error) {
      statusCode = error.statusCode ?? 500;
      code = (error as any).code ?? 'ERROR';
      message = error.message;
    }

    const errorResponse: StandardError = {
      code,
      message,
      details,
      correlationId,
      retriable: statusCode >= 500,
    };

    reply.status(statusCode).send(errorResponse);
  });
}, {
  name: 'error-handler-plugin',
});

export { NotFoundError };
