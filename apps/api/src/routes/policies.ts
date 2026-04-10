import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { policyArmedStateSchema, policySchema, siteIdSchema } from '@ainvr/contracts';
import type {
  AuditLogRepository,
  Policy,
  PolicyRepository,
  SiteRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

const paginationSchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  site_id: z.string().uuid().optional(),
});

const createPolicySchema = z.object({
  site_id: siteIdSchema.nullable().optional(),
  name: z.string().min(1),
  conditions: z.record(z.unknown()).optional(),
  schedule: z.record(z.unknown()).optional(),
  severity_rules: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  armed_state: policyArmedStateSchema.optional(),
});

const updatePolicySchema = z.object({
  site_id: siteIdSchema.nullable().optional(),
  name: z.string().min(1).optional(),
  conditions: z.record(z.unknown()).optional(),
  schedule: z.record(z.unknown()).optional(),
  severity_rules: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  armed_state: policyArmedStateSchema.optional(),
});

function toUpdatePayload(
  input: z.infer<typeof createPolicySchema> | z.infer<typeof updatePolicySchema>
): Partial<Policy> {
  const payload: Partial<Policy> = {};

  if ('site_id' in input && input.site_id !== undefined) {
    payload.site_id = input.site_id;
  }
  if ('name' in input && input.name !== undefined) {
    payload.name = input.name;
  }
  if ('conditions' in input && input.conditions !== undefined) {
    payload.conditions = input.conditions;
  }
  if ('schedule' in input && input.schedule !== undefined) {
    payload.schedule = input.schedule;
  }
  if ('severity_rules' in input && input.severity_rules !== undefined) {
    payload.severity_rules = input.severity_rules;
  }
  if ('enabled' in input && input.enabled !== undefined) {
    payload.enabled = input.enabled;
  }
  if ('armed_state' in input && input.armed_state !== undefined) {
    payload.armed_state = input.armed_state;
  }

  return payload;
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Querystring: z.infer<typeof paginationSchema>;
  }>(
    '/api/policies',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const repo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
      const page = parseInt(request.query.page || '1', 10);
      const pageSize = parseInt(request.query.pageSize || '20', 10);
      const offset = (page - 1) * pageSize;

      if (request.query.site_id) {
        const site = await siteRepo.findById(request.query.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Site not found' },
          };
        }
      }

      const result = request.query.site_id
        ? await repo.findBySiteId(request.query.site_id, { limit: pageSize, offset })
        : await repo.findByTenantId(request.user.tenant_id, { limit: pageSize, offset });

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
    Body: z.infer<typeof createPolicySchema>;
  }>(
    '/api/policies',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('security-admin', 'platform-admin', 'model-admin', 'integrations-admin'),
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

      const validated = createPolicySchema.parse(request.body);
      const repo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;

      if (validated.site_id) {
        const site = await siteRepo.findById(validated.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Site not found' },
          };
        }
      }

      const policy = await repo.create({
        tenant_id: request.user.tenant_id,
        site_id: validated.site_id ?? null,
        name: validated.name,
        conditions: validated.conditions ?? {},
        schedule: validated.schedule ?? {},
        severity_rules: validated.severity_rules ?? {},
        enabled: validated.enabled ?? true,
        armed_state: validated.armed_state ?? 'armed',
      });

      await auditRepo.log(
        request.user.tenant_id,
        request.user.sub,
        'CREATE',
        'policy',
        policy.id,
        {
          name: policy.name,
          site_id: policy.site_id,
          enabled: policy.enabled,
        },
        request.ip || undefined
      );

      reply.code(201);
      return {
        success: true,
        data: policy,
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/policies/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const repo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const policy = await repo.findById(request.params.id);

      if (!policy) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        };
      }

      if (policy.tenant_id !== request.user.tenant_id) {
        reply.code(403);
        return {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        };
      }

      return {
        success: true,
        data: policySchema.parse(policy),
      };
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: z.infer<typeof updatePolicySchema>;
  }>(
    '/api/policies/:id',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('security-admin', 'platform-admin', 'model-admin', 'integrations-admin'),
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

      const validated = updatePolicySchema.parse(request.body);
      const repo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;

      const existingPolicy = await repo.findById(request.params.id);
      if (!existingPolicy) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        };
      }

      if (existingPolicy.tenant_id !== request.user.tenant_id) {
        reply.code(403);
        return {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        };
      }

      if (validated.site_id) {
        const site = await siteRepo.findById(validated.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Site not found' },
          };
        }
      }

      const updated = await repo.update(request.params.id, toUpdatePayload(validated));

      await auditRepo.log(
        request.user.tenant_id,
        request.user.sub,
        'UPDATE',
        'policy',
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
    '/api/policies/:id',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('security-admin', 'platform-admin', 'model-admin', 'integrations-admin'),
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

      const repo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const existingPolicy = await repo.findById(request.params.id);

      if (!existingPolicy) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        };
      }

      if (existingPolicy.tenant_id !== request.user.tenant_id) {
        reply.code(403);
        return {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        };
      }

      await repo.delete(request.params.id);

      await auditRepo.log(
        request.user.tenant_id,
        request.user.sub,
        'DELETE',
        'policy',
        request.params.id,
        {
          name: existingPolicy.name,
          site_id: existingPolicy.site_id,
        },
        request.ip || undefined
      );

      return {
        success: true,
        data: { deleted: true },
      };
    }
  );
});
