import type { FastifyInstance } from 'fastify';
import sitesRoutes from './sites.js';
import camerasRoutes from './cameras.js';
import incidentsRoutes from './incidents.js';
import policiesRoutes from './policies.js';
import authRoutes from './auth.js';
import auditRoutes from './audit.js';
import zonesRoutes from './zones.js';
import streamsRoutes from './streams.js';
import storageRoutes from './storage.js';
import mediaRoutes from './media.js';
import timelineRoutes from './timeline.js';
import eventsRoutes from './events.js';
import alertRoutesRoutes from './alert-routes.js';
import searchRoutes from './search.js';
import intelligenceRoutes from './intelligence.js';
import mlRoutes from './ml.js';

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(sitesRoutes);
  await server.register(zonesRoutes);
  await server.register(camerasRoutes);
  await server.register(streamsRoutes);
  await server.register(mediaRoutes);
  await server.register(timelineRoutes);
  await server.register(eventsRoutes);
  await server.register(incidentsRoutes);
  await server.register(searchRoutes);
  await server.register(intelligenceRoutes);
  await server.register(mlRoutes);
  await server.register(policiesRoutes);
  await server.register(alertRoutesRoutes);
  await server.register(storageRoutes);
  await server.register(authRoutes);
  await server.register(auditRoutes);
}
