import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type {
  ClipRepository,
  EventRepository,
  IncidentRepository,
  ModelLifecycleRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import { runModelLifecyclePipeline } from '../ml/model-lifecycle.js';

export default fp(async (fastify: FastifyInstance) => {
  fastify.get(
    '/api/ml/overview',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const lifecycleRepository = fastify.diContainer.cradle
        .modelLifecycleRepository as ModelLifecycleRepository;

      const [annotations, datasets, trainingJobs, models, deployments] = await Promise.all([
        lifecycleRepository.listAnnotationTasks(request.user.tenant_id, { limit: 100, offset: 0 }),
        lifecycleRepository.listDatasetVersions(request.user.tenant_id, { limit: 50, offset: 0 }),
        lifecycleRepository.listTrainingJobs(request.user.tenant_id, { limit: 50, offset: 0 }),
        lifecycleRepository.listModels(request.user.tenant_id, { limit: 50, offset: 0 }),
        lifecycleRepository.listDeployments(request.user.tenant_id, { limit: 50, offset: 0 }),
      ]);

      return {
        success: true,
        data: {
          summary: {
            annotations: annotations.total,
            datasets: datasets.total,
            training_jobs: trainingJobs.total,
            models: models.total,
            deployments: deployments.total,
          },
          annotations: annotations.data,
          datasets: datasets.data,
          training_jobs: trainingJobs.data,
          models: models.data,
          deployments: deployments.data,
        },
      };
    }
  );

  fastify.post(
    '/api/ml/pipeline/run',
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

      const lifecycleRepository = fastify.diContainer.cradle
        .modelLifecycleRepository as ModelLifecycleRepository;
      const incidentRepository = fastify.diContainer.cradle.incidentRepository as IncidentRepository;
      const eventRepository = fastify.diContainer.cradle.eventRepository as EventRepository;
      const clipRepository = fastify.diContainer.cradle.clipRepository as ClipRepository;

      const result = await runModelLifecyclePipeline({
        tenantId: request.user.tenant_id,
        incidentRepository,
        eventRepository,
        clipRepository,
        lifecycleRepository,
      });

      return {
        success: true,
        data: result,
      };
    }
  );
}, {
  name: 'ml-routes',
});
