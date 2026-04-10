import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { AuditLogRepository } from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

const auditQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  resource_type: z.string().optional(),
});

export default fp(
  async (fastify: FastifyInstance) => {
    // GET /api/audit-logs - List audit logs (platform-admin only, paginated)
    fastify.get<{
      Querystring: z.infer<typeof auditQuerySchema>;
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
        const query = auditQuerySchema.parse(request.query);
        const page = parseInt(query.page, 10);
        const pageSize = parseInt(query.pageSize, 10);
        const allLogs = await auditRepo.findByTenantId(request.user.tenant_id, {
          limit: 500,
          offset: 0,
        });
        const filtered = allLogs.data
          .filter((log) => !query.user_id || log.user_id === query.user_id)
          .filter((log) => !query.action || log.action === query.action)
          .filter((log) => !query.resource_type || log.resource_type === query.resource_type);
        const offset = (page - 1) * pageSize;
        const result = filtered.slice(offset, offset + pageSize);

        return {
          success: true,
          data: {
            data: result,
            page,
            pageSize,
            total: filtered.length,
            hasMore: offset + pageSize < filtered.length,
          },
        };
      }
    );

    fastify.get(
      '/api/audit-logs/summary',
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
        const allLogs = await auditRepo.findByTenantId(request.user.tenant_id, {
          limit: 500,
          offset: 0,
        });

        const actions = Object.entries(
          allLogs.data.reduce<Record<string, number>>((accumulator, log) => {
            accumulator[log.action] = (accumulator[log.action] ?? 0) + 1;
            return accumulator;
          }, {})
        )
          .map(([action, count]) => ({ action, count }))
          .sort((left, right) => right.count - left.count);

        const resources = Object.entries(
          allLogs.data.reduce<Record<string, number>>((accumulator, log) => {
            accumulator[log.resource_type] = (accumulator[log.resource_type] ?? 0) + 1;
            return accumulator;
          }, {})
        )
          .map(([resource_type, count]) => ({ resource_type, count }))
          .sort((left, right) => right.count - left.count);

        return {
          success: true,
          data: {
            total: allLogs.total,
            actions,
            resources,
          },
        };
      }
    );
  },
  {
    name: 'audit-routes',
  }
);
