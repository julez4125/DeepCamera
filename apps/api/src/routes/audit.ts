import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { AuditLogRepository } from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

export default fp(
  async (fastify: FastifyInstance) => {
    // GET /api/audit-logs - List audit logs (platform-admin only, paginated)
    fastify.get<{
      Querystring: {
        page?: string;
        pageSize?: string;
      };
    }>(
      '/api/audit-logs',
      { preHandler: [fastify.authenticate, requireRole('platform-admin')] },
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

        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;
        const page = parseInt(request.query.page || '1', 10);
        const pageSize = parseInt(request.query.pageSize || '20', 10);
        const offset = (page - 1) * pageSize;

        const result = await auditRepo.findByTenantId(request.user.tenant_id, {
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
  },
  {
    name: 'audit-routes',
  }
);
