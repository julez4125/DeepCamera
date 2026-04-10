import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { zoneSchema } from '@ainvr/contracts';
import type {
  AuditLogRepository,
  SiteRepository,
  ZoneRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

const createZoneSchema = zoneSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

const updateZoneSchema = createZoneSchema.partial().omit({
  site_id: true,
});

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.get<{
      Params: { siteId: string };
      Querystring: { page?: string; pageSize?: string };
    }>(
      '/api/sites/:siteId/zones',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const zoneRepo = fastify.diContainer.cradle.zoneRepository as ZoneRepository;
        const site = await siteRepo.findById(request.params.siteId);

        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Site not found' },
          };
        }

        const page = parseInt(request.query.page || '1', 10);
        const pageSize = parseInt(request.query.pageSize || '20', 10);
        const offset = (page - 1) * pageSize;
        const result = await zoneRepo.findBySiteId(request.params.siteId, {
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
      Params: { siteId: string };
      Body: Omit<z.infer<typeof createZoneSchema>, 'site_id'>;
    }>(
      '/api/sites/:siteId/zones',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const zoneRepo = fastify.diContainer.cradle.zoneRepository as ZoneRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const site = await siteRepo.findById(request.params.siteId);

        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Site not found' },
          };
        }

        const validated = createZoneSchema.omit({ site_id: true }).parse(request.body);
        const zone = await zoneRepo.create({
          site_id: request.params.siteId,
          ...validated,
        });

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'CREATE',
          'zone',
          zone.id,
          { site_id: zone.site_id, name: zone.name, zone_type: zone.zone_type },
          request.ip || undefined
        );

        reply.code(201);
        return {
          success: true,
          data: zone,
        };
      }
    );

    fastify.get<{
      Params: { id: string };
    }>(
      '/api/zones/:id',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const zoneRepo = fastify.diContainer.cradle.zoneRepository as ZoneRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const zone = await zoneRepo.findById(request.params.id);

        if (!zone) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Zone not found' },
          };
        }

        const site = await siteRepo.findById(zone.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          };
        }

        return {
          success: true,
          data: zone,
        };
      }
    );

    fastify.patch<{
      Params: { id: string };
      Body: z.infer<typeof updateZoneSchema>;
    }>(
      '/api/zones/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const zoneRepo = fastify.diContainer.cradle.zoneRepository as ZoneRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const zone = await zoneRepo.findById(request.params.id);

        if (!zone) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Zone not found' },
          };
        }

        const site = await siteRepo.findById(zone.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          };
        }

        const validated = updateZoneSchema.parse(request.body);
        const updated = await zoneRepo.update(request.params.id, validated);

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'UPDATE',
          'zone',
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
      '/api/zones/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const zoneRepo = fastify.diContainer.cradle.zoneRepository as ZoneRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
        const zone = await zoneRepo.findById(request.params.id);

        if (!zone) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Zone not found' },
          };
        }

        const site = await siteRepo.findById(zone.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          };
        }

        const deleted = await zoneRepo.delete(request.params.id);
        if (deleted) {
          await auditRepo.log(
            request.user.tenant_id,
            request.user.sub,
            'DELETE',
            'zone',
            request.params.id,
            { name: zone.name },
            request.ip || undefined
          );
        }

        reply.code(204);
        return;
      }
    );
  },
  {
    name: 'zones-routes',
  }
);
