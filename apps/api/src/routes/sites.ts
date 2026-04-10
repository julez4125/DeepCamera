import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { siteSchema } from '@ainvr/contracts';
import type { SiteRepository, AuditLogRepository } from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

const createSiteSchema = siteSchema.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
});

const updateSiteSchema = createSiteSchema.partial();

export default fp(
  async (fastify: FastifyInstance) => {
    // GET /api/sites - List sites (paginated, tenant-scoped)
    fastify.get<{
      Querystring: {
        page?: string;
        pageSize?: string;
      };
    }>(
      '/api/sites',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const page = parseInt(request.query.page || '1', 10);
        const pageSize = parseInt(request.query.pageSize || '20', 10);
        const offset = (page - 1) * pageSize;

        const result = await siteRepo.findByTenantId(request.user.tenant_id, {
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

    // POST /api/sites - Create site
    fastify.post<{
      Body: z.infer<typeof createSiteSchema>;
    }>(
      '/api/sites',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        const validated = createSiteSchema.parse(request.body);
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const site = await siteRepo.create({
          tenant_id: request.user.tenant_id,
          name: validated.name,
          address: validated.address,
          timezone: validated.timezone,
        });

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'CREATE',
          'site',
          site.id,
          {
            name: site.name,
            address: site.address,
          },
          request.ip || undefined
        );

        reply.code(201);
        return {
          success: true,
          data: site,
        };
      }
    );

    // GET /api/sites/:id - Get site detail
    fastify.get<{
      Params: { id: string };
    }>(
      '/api/sites/:id',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const site = await siteRepo.findById(request.params.id);

        if (!site) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Site not found',
            },
          };
        }

        // Verify tenant ownership
        if (site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        return {
          success: true,
          data: site,
        };
      }
    );

    // PATCH /api/sites/:id - Update site
    fastify.patch<{
      Params: { id: string };
      Body: z.infer<typeof updateSiteSchema>;
    }>(
      '/api/sites/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        const validated = updateSiteSchema.parse(request.body);
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingSite = await siteRepo.findById(request.params.id);
        if (!existingSite) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Site not found',
            },
          };
        }

        // Verify tenant ownership
        if (existingSite.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const updated = await siteRepo.update(request.params.id, validated);

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'UPDATE',
          'site',
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

    // DELETE /api/sites/:id - Delete site
    fastify.delete<{
      Params: { id: string };
    }>(
      '/api/sites/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingSite = await siteRepo.findById(request.params.id);
        if (!existingSite) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Site not found',
            },
          };
        }

        // Verify tenant ownership
        if (existingSite.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const deleted = await siteRepo.delete(request.params.id);

        if (deleted) {
          // Log audit event
          await auditRepo.log(
            request.user.tenant_id,
            request.user.sub,
            'DELETE',
            'site',
            request.params.id,
            { name: existingSite.name },
            request.ip || undefined
          );
        }

        reply.code(204);
        return;
      }
    );
  },
  {
    name: 'sites-routes',
  }
);
