import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  CameraRepository,
  EventRepository,
  IncidentRepository,
  SpecializedIntelligenceRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import { processSpecializedIntelligence } from '../intelligence/specialized-intelligence.js';

const overviewQuerySchema = z.object({
  incident_id: z.string().uuid().optional(),
  camera_id: z.string().uuid().optional(),
});

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Querystring: z.infer<typeof overviewQuerySchema>;
  }>(
    '/api/intelligence/overview',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const query = overviewQuerySchema.parse(request.query);
      const intelligenceRepository = fastify.diContainer.cradle
        .specializedIntelligenceRepository as SpecializedIntelligenceRepository;

      const [watchlists, profiles, plateReads, faceMatches, reIdLinks] = await Promise.all([
        intelligenceRepository.listWatchlists(request.user.tenant_id, { limit: 50, offset: 0 }),
        intelligenceRepository.listIdentityProfiles(request.user.tenant_id, { limit: 50, offset: 0 }),
        intelligenceRepository.listPlateReads(request.user.tenant_id, { limit: 100, offset: 0 }, query),
        intelligenceRepository.listFaceMatches(request.user.tenant_id, { limit: 100, offset: 0 }, query),
        intelligenceRepository.listReIdLinks(request.user.tenant_id, { limit: 100, offset: 0 }, query),
      ]);

      return {
        success: true,
        data: {
          summary: {
            watchlists: watchlists.total,
            identity_profiles: profiles.total,
            plate_reads: plateReads.total,
            face_matches: faceMatches.total,
            reid_links: reIdLinks.total,
          },
          watchlists: watchlists.data,
          identity_profiles: profiles.data,
          plate_reads: plateReads.data,
          face_matches: faceMatches.data,
          reid_links: reIdLinks.data,
        },
      };
    }
  );

  fastify.post(
    '/api/intelligence/process',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('operator', 'security-admin', 'platform-admin', 'model-admin'),
      ],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const intelligenceRepository = fastify.diContainer.cradle
        .specializedIntelligenceRepository as SpecializedIntelligenceRepository;
      const incidentRepository = fastify.diContainer.cradle.incidentRepository as IncidentRepository;
      const eventRepository = fastify.diContainer.cradle.eventRepository as EventRepository;
      const cameraRepository = fastify.diContainer.cradle.cameraRepository as CameraRepository;

      const [incidentsPage, eventsPage, camerasPage] = await Promise.all([
        incidentRepository.findAll({ tenant_id: request.user.tenant_id }, { limit: 100, offset: 0 }),
        eventRepository.findByTenantId(request.user.tenant_id, { limit: 100, offset: 0 }),
        cameraRepository.findAll({}, { limit: 100, offset: 0 }),
      ]);

      const result = await processSpecializedIntelligence({
        tenantId: request.user.tenant_id,
        incidents: incidentsPage.data,
        events: eventsPage.data,
        cameras: camerasPage.data,
        repository: intelligenceRepository,
      });

      return {
        success: true,
        data: result,
      };
    }
  );
}, {
  name: 'intelligence-routes',
});
