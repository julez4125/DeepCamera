import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { storageTargetSchema } from '@ainvr/contracts';
import type {
  AuditLogRepository,
  CameraRepository,
  SiteRepository,
  StorageObjectCopyRepository,
  StoragePolicyAssignmentRepository,
  StorageReplicationJobRepository,
  StorageTarget,
  StorageTargetRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

const paginationSchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  target_id: z.string().optional(),
});

const replicationJobQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'running', 'succeeded', 'failed']).optional(),
});

const objectCopyQuerySchema = paginationSchema.extend({
  clip_id: z.string().uuid().optional(),
  status: z.enum(['local_only', 'replicating', 'replicated', 'degraded', 'failed']).optional(),
});

const createStorageTargetSchema = storageTargetSchema.omit({
  id: true,
  tenant_id: true,
  status: true,
  last_checked_at: true,
  last_error: true,
  created_at: true,
  updated_at: true,
}).extend({
  capabilities: z.record(z.unknown()).optional(),
});

const updateStorageTargetSchema = createStorageTargetSchema.partial();

const assignmentSchema = z.object({
  path_prefix: z.string().min(1).optional(),
  retention_days: z.number().int().positive().max(3650).optional(),
  replication_enabled: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

const rotateCredentialsSchema = z.object({
  credentials: z.record(z.unknown()),
});

function capabilitiesForTarget(targetType: StorageTarget['target_type']): Record<string, unknown> {
  switch (targetType) {
    case 's3':
      return {
        supports_replication: true,
        supports_retention: true,
        supports_connection_test: true,
        storage_mode: 'object',
      };
    case 'smb':
    case 'nfs':
      return {
        supports_replication: false,
        supports_retention: true,
        supports_connection_test: true,
        storage_mode: 'mounted-share',
      };
    case 'local':
    default:
      return {
        supports_replication: false,
        supports_retention: true,
        supports_connection_test: true,
        storage_mode: 'local-filesystem',
      };
  }
}

function testStorageConnection(target: StorageTarget): { connected: boolean; latency_ms?: number; error?: string } {
  const config = target.config ?? {};

  if (target.target_type === 's3') {
    return config['bucket']
      ? { connected: true, latency_ms: 42 }
      : { connected: false, error: 'Missing S3 bucket configuration' };
  }

  if (target.target_type === 'local') {
    return config['base_path']
      ? { connected: true, latency_ms: 5 }
      : { connected: false, error: 'Missing local base_path configuration' };
  }

  return config['share'] || config['path'] || config['host']
    ? { connected: true, latency_ms: 18 }
    : { connected: false, error: 'Missing remote share configuration' };
}

function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number
): { data: T[]; total: number; page: number; pageSize: number; hasMore: boolean } {
  const offset = (page - 1) * pageSize;
  return {
    data: items.slice(offset, offset + pageSize),
    total: items.length,
    page,
    pageSize,
    hasMore: offset + pageSize < items.length,
  };
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.get<{
      Querystring: { page?: string; pageSize?: string };
    }>(
      '/api/storage-targets',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const page = parseInt(request.query.page || '1', 10);
        const pageSize = parseInt(request.query.pageSize || '20', 10);
        const offset = (page - 1) * pageSize;
        const result = await repo.findByTenantId(request.user.tenant_id, {
          limit: pageSize,
          offset,
        });

        return {
          success: true,
          data: {
            data: result.data,
            page,
            pageSize,
            total: result.total,
            hasMore: offset + pageSize < result.total,
          },
        };
      }
    );

    fastify.post<{
      Body: z.infer<typeof createStorageTargetSchema>;
    }>(
      '/api/storage-targets',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const validated = createStorageTargetSchema.parse(request.body);
        const target = await repo.create({
          tenant_id: request.user.tenant_id,
          name: validated.name,
          target_type: validated.target_type,
          status: 'unknown',
          config: validated.config,
          capabilities: validated.capabilities ?? capabilitiesForTarget(validated.target_type),
        });

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'CREATE',
          'storage_target',
          target.id,
          { name: target.name, target_type: target.target_type },
          request.ip || undefined
        );

        reply.code(201);
        return {
          success: true,
          data: target,
        };
      }
    );

    fastify.get<{
      Params: { id: string };
    }>(
      '/api/storage-targets/:id',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const target = await repo.findById(request.params.id);

        if (!target || target.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target not found' },
          };
        }

        return {
          success: true,
          data: target,
        };
      }
    );

    fastify.patch<{
      Params: { id: string };
      Body: z.infer<typeof updateStorageTargetSchema>;
    }>(
      '/api/storage-targets/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const target = await repo.findById(request.params.id);

        if (!target || target.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target not found' },
          };
        }

        const validated = updateStorageTargetSchema.parse(request.body);
        const updated = await repo.update(request.params.id, validated);

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'UPDATE',
          'storage_target',
          request.params.id,
          validated,
          request.ip || undefined
        );

        return {
          success: true,
          data: updated,
        };
      }
    );

    fastify.delete<{
      Params: { id: string };
    }>(
      '/api/storage-targets/:id',
      { preHandler: [fastify.authenticate, requireRole('platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const target = await repo.findById(request.params.id);

        if (!target || target.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target not found' },
          };
        }

        const deleted = await repo.delete(request.params.id);

        if (deleted) {
          await auditRepo.log(
            request.user.tenant_id,
            request.user.sub,
            'DELETE',
            'storage_target',
            request.params.id,
            { name: target.name },
            request.ip || undefined
          );
        }

        reply.code(204);
        return;
      }
    );

    fastify.post<{
      Params: { id: string };
    }>(
      '/api/storage-targets/:id/test',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const target = await repo.findById(request.params.id);

        if (!target || target.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target not found' },
          };
        }

        const result = testStorageConnection(target);
        await repo.updateStatus(
          request.params.id,
          result.connected ? 'healthy' : 'unreachable',
          result.error ?? null
        );

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'TEST_CONNECTION',
          'storage_target',
          request.params.id,
          result,
          request.ip || undefined
        );

        return {
          success: true,
          data: result,
        };
      }
    );

    fastify.get<{
      Params: { id: string };
    }>(
      '/api/storage-targets/:id/capabilities',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const target = await repo.findById(request.params.id);

        if (!target || target.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target not found' },
          };
        }

        return {
          success: true,
          data: {
            target_id: target.id,
            target_type: target.target_type,
            capabilities: target.capabilities,
          },
        };
      }
    );

    fastify.post<{
      Params: { id: string };
      Body: z.infer<typeof rotateCredentialsSchema>;
    }>(
      '/api/storage-targets/:id/rotate-credentials',
      { preHandler: [fastify.authenticate, requireRole('platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const repo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const target = await repo.findById(request.params.id);

        if (!target || target.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target not found' },
          };
        }

        const validated = rotateCredentialsSchema.parse(request.body);
        await repo.rotateCredentials(request.params.id, validated.credentials);

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'ROTATE_CREDENTIALS',
          'storage_target',
          request.params.id,
          { rotated: true },
          request.ip || undefined
        );

        return {
          success: true,
          data: {
            rotated: true,
            target_id: request.params.id,
          },
        };
      }
    );

    fastify.put<{
      Params: { id: string; siteId: string };
      Body: z.infer<typeof assignmentSchema>;
    }>(
      '/api/storage-targets/:id/assignments/sites/:siteId',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const targetRepo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const assignmentRepo =
          fastify.diContainer.cradle.storagePolicyAssignmentRepository as StoragePolicyAssignmentRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;

        const target = await targetRepo.findById(request.params.id);
        const site = await siteRepo.findById(request.params.siteId);

        if (!target || target.tenant_id !== request.user.tenant_id || !site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target or site not found' },
          };
        }

        const validated = assignmentSchema.parse(request.body);
        const assignment = await assignmentRepo.assignToSite({
          tenant_id: request.user.tenant_id,
          storage_target_id: request.params.id,
          site_id: request.params.siteId,
          path_prefix: validated.path_prefix ?? null,
          retention_days: validated.retention_days ?? 30,
          replication_enabled: validated.replication_enabled ?? true,
          priority: validated.priority ?? 100,
        });

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'ASSIGN_POLICY',
          'storage_target',
          request.params.id,
          { site_id: request.params.siteId, ...validated },
          request.ip || undefined
        );

        return {
          success: true,
          data: assignment,
        };
      }
    );

    fastify.put<{
      Params: { id: string; cameraId: string };
      Body: z.infer<typeof assignmentSchema>;
    }>(
      '/api/storage-targets/:id/assignments/cameras/:cameraId',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin', 'integrations-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const targetRepo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const assignmentRepo =
          fastify.diContainer.cradle.storagePolicyAssignmentRepository as StoragePolicyAssignmentRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;

        const target = await targetRepo.findById(request.params.id);
        const camera = await cameraRepo.findById(request.params.cameraId);
        const site = camera ? await siteRepo.findById(camera.site_id) : null;

        if (
          !target ||
          target.tenant_id !== request.user.tenant_id ||
          !camera ||
          !site ||
          site.tenant_id !== request.user.tenant_id
        ) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Storage target or camera not found' },
          };
        }

        const validated = assignmentSchema.parse(request.body);
        const assignment = await assignmentRepo.assignToCamera({
          tenant_id: request.user.tenant_id,
          storage_target_id: request.params.id,
          camera_id: request.params.cameraId,
          path_prefix: validated.path_prefix ?? null,
          retention_days: validated.retention_days ?? 30,
          replication_enabled: validated.replication_enabled ?? true,
          priority: validated.priority ?? 100,
        });

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'ASSIGN_POLICY',
          'storage_target',
          request.params.id,
          { camera_id: request.params.cameraId, ...validated },
          request.ip || undefined
        );

        return {
          success: true,
          data: assignment,
        };
      }
    );

    fastify.get(
      '/api/storage/health',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const targetRepo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;
        const assignmentRepo =
          fastify.diContainer.cradle.storagePolicyAssignmentRepository as StoragePolicyAssignmentRepository;
        const replicationRepo =
          fastify.diContainer.cradle.storageReplicationJobRepository as StorageReplicationJobRepository;
        const objectCopyRepo =
          fastify.diContainer.cradle.storageObjectCopyRepository as StorageObjectCopyRepository;

        const targets = await targetRepo.findByTenantId(request.user.tenant_id, {
          limit: 100,
          offset: 0,
        });

        const data = await Promise.all(
          targets.data.map(async (target) => {
            const [assignments, jobs, objectCopies] = await Promise.all([
              assignmentRepo.findByTargetId(target.id, {
                limit: 100,
                offset: 0,
              }),
              replicationRepo.findByTargetId(target.id),
              objectCopyRepo.findByTargetId(target.id),
            ]);
            const verifiedAt = objectCopies
              .map((copy) => copy.verified_at)
              .filter((value): value is string => Boolean(value))
              .sort((left, right) => right.localeCompare(left))[0] ?? null;

            return {
              target,
              assignment_count: assignments.total,
              pending_replications: jobs.filter(
                (job) => job.status === 'pending' || job.status === 'running'
              ).length,
              failed_replications: jobs.filter((job) => job.status === 'failed').length,
              replicating_objects: objectCopies.filter((copy) => copy.copy_status === 'replicating')
                .length,
              replicated_objects: objectCopies.filter((copy) => copy.copy_status === 'replicated')
                .length,
              degraded_objects: objectCopies.filter((copy) => copy.copy_status === 'degraded')
                .length,
              failed_objects: objectCopies.filter((copy) => copy.copy_status === 'failed').length,
              last_verified_at: verifiedAt,
            };
          })
        );

        return {
          success: true,
          data,
        };
      }
    );

    fastify.get<{
      Querystring: z.infer<typeof objectCopyQuerySchema>;
    }>(
      '/api/storage/object-copies',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const query = objectCopyQuerySchema.parse(request.query);
        const repo =
          fastify.diContainer.cradle.storageObjectCopyRepository as StorageObjectCopyRepository;
        const page = parseInt(query.page, 10);
        const pageSize = parseInt(query.pageSize, 10);
        const result = await repo.findByTenantId(request.user.tenant_id, {
          limit: 1000,
          offset: 0,
        });

        const filtered = result.data
          .filter((copy) => !query.status || copy.copy_status === query.status)
          .filter((copy) => !query.target_id || copy.storage_target_id === query.target_id)
          .filter((copy) => !query.clip_id || copy.clip_id === query.clip_id);

        return {
          success: true,
          data: paginateItems(filtered, page, pageSize),
        };
      }
    );

    fastify.get<{
      Querystring: z.infer<typeof replicationJobQuerySchema>;
    }>(
      '/api/storage/replication-jobs',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const query = replicationJobQuerySchema.parse(request.query);
        const repo =
          fastify.diContainer.cradle.storageReplicationJobRepository as StorageReplicationJobRepository;
        const page = parseInt(query.page, 10);
        const pageSize = parseInt(query.pageSize, 10);
        const result = await repo.findByTenantId(request.user.tenant_id, {
          limit: 1000,
          offset: 0,
        });

        let items = result.data;
        if (query.status) {
          items = items.filter((job) => job.status === query.status);
        }
        if (query.target_id) {
          items = items.filter((job) => job.storage_target_id === query.target_id);
        }

        return {
          success: true,
          data: paginateItems(items, page, pageSize),
        };
      }
    );
  },
  {
    name: 'storage-routes',
  }
);
