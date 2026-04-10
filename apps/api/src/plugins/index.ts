import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { jwtPlugin, rbacPlugin } from '../auth/index.js';
import errorHandler from './error-handler.js';
import repositoryContainerPlugin from './repository-container.js';

export async function registerPlugins(server: FastifyInstance): Promise<void> {
  // Register CORS plugin
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
  });

  // Register the default repository container used by the scaffold and tests.
  await server.register(repositoryContainerPlugin);

  // Register error handler plugin first so it catches all errors
  await server.register(errorHandler);

  // Register JWT/Auth plugin
  await server.register(jwtPlugin);

  // Register RBAC plugin
  await server.register(rbacPlugin);
}
