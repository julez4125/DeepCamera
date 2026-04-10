import fastify, { type FastifyInstance } from 'fastify';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';

export async function createServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register all plugins
  await registerPlugins(server);

  // Health check route (no auth required)
  server.get('/api/health', async (_request, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register all routes
  await registerRoutes(server);

  return server;
}
