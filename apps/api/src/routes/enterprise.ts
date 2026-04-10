import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  AlertRouteRepository,
  CameraRepository,
  EnrichmentRepository,
  EventRepository,
  IncidentRepository,
  ModelLifecycleRepository,
  PolicyRepository,
  SiteRepository,
  SpecializedIntelligenceRepository,
  StorageReplicationJobRepository,
  StorageTargetRepository,
  TenantHardeningRepository,
  TenantRepository,
  AuditLogRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import { buildObservabilityOverview, buildTenantHardeningOverview } from '../enterprise/hardening.js';

const quotaUpdateSchema = z.object({
  max_sites: z.number().int().positive().optional(),
  max_cameras_per_site: z.number().int().positive().optional(),
  max_storage_targets: z.number().int().positive().optional(),
  max_monthly_exports: z.number().int().nonnegative().optional(),
  max_retention_days: z.number().int().positive().optional(),
  enabled_modules: z.array(z.string().min(1)).optional(),
});

export default fp(async (fastify: FastifyInstance) => {
  fastify.get(
    '/api/observability/overview',
    {
      preHandler: [fastify.authenticate, requireRole('platform-admin', 'security-admin', 'model-admin')],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const data = await buildObservabilityOverview(request.user.tenant_id, {
        siteRepository: fastify.diContainer.cradle.siteRepository as SiteRepository,
        cameraRepository: fastify.diContainer.cradle.cameraRepository as CameraRepository,
        incidentRepository: fastify.diContainer.cradle.incidentRepository as IncidentRepository,
        policyRepository: fastify.diContainer.cradle.policyRepository as PolicyRepository,
        alertRouteRepository: fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository,
        storageTargetRepository: fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository,
        storageReplicationJobRepository: fastify.diContainer.cradle.storageReplicationJobRepository as StorageReplicationJobRepository,
        specializedIntelligenceRepository: fastify.diContainer.cradle.specializedIntelligenceRepository as SpecializedIntelligenceRepository,
        modelLifecycleRepository: fastify.diContainer.cradle.modelLifecycleRepository as ModelLifecycleRepository,
        enrichmentRepository: fastify.diContainer.cradle.enrichmentRepository as EnrichmentRepository,
        eventRepository: fastify.diContainer.cradle.eventRepository as EventRepository,
      });

      return {
        success: true,
        data,
      };
    }
  );

  fastify.get(
    '/api/tenants/hardening',
    {
      preHandler: [fastify.authenticate, requireRole('platform-admin')],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const data = await buildTenantHardeningOverview({
        tenantRepository: fastify.diContainer.cradle.tenantRepository as TenantRepository,
        tenantHardeningRepository: fastify.diContainer.cradle.tenantHardeningRepository as TenantHardeningRepository,
        siteRepository: fastify.diContainer.cradle.siteRepository as SiteRepository,
        cameraRepository: fastify.diContainer.cradle.cameraRepository as CameraRepository,
        incidentRepository: fastify.diContainer.cradle.incidentRepository as IncidentRepository,
        policyRepository: fastify.diContainer.cradle.policyRepository as PolicyRepository,
        alertRouteRepository: fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository,
        storageTargetRepository: fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository,
        storageReplicationJobRepository: fastify.diContainer.cradle.storageReplicationJobRepository as StorageReplicationJobRepository,
        specializedIntelligenceRepository: fastify.diContainer.cradle.specializedIntelligenceRepository as SpecializedIntelligenceRepository,
        modelLifecycleRepository: fastify.diContainer.cradle.modelLifecycleRepository as ModelLifecycleRepository,
      });

      return {
        success: true,
        data,
      };
    }
  );

  fastify.put<{
    Params: { tenantId: string };
    Body: z.infer<typeof quotaUpdateSchema>;
  }>(
    '/api/tenants/:tenantId/quotas',
    {
      preHandler: [fastify.authenticate, requireRole('platform-admin')],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const tenantRepository = fastify.diContainer.cradle.tenantRepository as TenantRepository;
      const tenantHardeningRepository = fastify.diContainer.cradle.tenantHardeningRepository as TenantHardeningRepository;
      const auditLogRepository = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const tenant = await tenantRepository.findById(request.params.tenantId);

      if (!tenant) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found' },
        };
      }

      const payload = quotaUpdateSchema.parse(request.body);
      const quota = await tenantHardeningRepository.upsertTenantQuota(request.params.tenantId, payload);
      await auditLogRepository.log(
        request.user.tenant_id,
        request.user.sub,
        'UPDATE',
        'tenant_quota',
        request.params.tenantId,
        payload,
        request.ip || undefined
      );

      return {
        success: true,
        data: quota,
      };
    }
  );
}, {
  name: 'enterprise-routes',
});
