import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  AlertRouteRepository,
  AuditLogRepository,
  IncidentRepository,
  PolicyRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import { dispatchAlerts, escalationDueAt } from '../alerting/alert-dispatcher.js';
import { resolvePoliciesForIncident } from '../incidents/incident-engine.js';

const alertRouteSchema = z.object({
  channel: z.enum(['webhook', 'mqtt', 'telegram', 'discord', 'slack', 'email']),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

const updateAlertRouteSchema = alertRouteSchema.partial();

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Params: { policyId: string };
  }>(
    '/api/policies/:policyId/alert-routes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const policyRepo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const routeRepo = fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository;
      const policy = await policyRepo.findById(request.params.policyId);

      if (!policy || policy.tenant_id !== request.user.tenant_id) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Policy not found' } };
      }

      return {
        success: true,
        data: await routeRepo.findByPolicyId(policy.id),
      };
    }
  );

  fastify.post<{
    Params: { policyId: string };
    Body: z.infer<typeof alertRouteSchema>;
  }>(
    '/api/policies/:policyId/alert-routes',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('security-admin', 'platform-admin', 'integrations-admin'),
      ],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const policyRepo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const routeRepo = fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const policy = await policyRepo.findById(request.params.policyId);

      if (!policy || policy.tenant_id !== request.user.tenant_id) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Policy not found' } };
      }

      const validated = alertRouteSchema.parse(request.body);
      const created = await routeRepo.create({
        policy_id: policy.id,
        channel: validated.channel,
        config: validated.config,
        enabled: validated.enabled ?? true,
      });

      await auditRepo.log(
        request.user.tenant_id,
        request.user.sub,
        'CREATE',
        'alert_route',
        created.id,
        {
          policy_id: policy.id,
          channel: created.channel,
        },
        request.ip || undefined
      );

      reply.code(201);
      return {
        success: true,
        data: created,
      };
    }
  );

  fastify.patch<{
    Params: { policyId: string; routeId: string };
    Body: z.infer<typeof updateAlertRouteSchema>;
  }>(
    '/api/policies/:policyId/alert-routes/:routeId',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('security-admin', 'platform-admin', 'integrations-admin'),
      ],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const policyRepo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const routeRepo = fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const policy = await policyRepo.findById(request.params.policyId);
      const route = await routeRepo.findById(request.params.routeId);

      if (!policy || policy.tenant_id !== request.user.tenant_id || !route || route.policy_id !== policy.id) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Alert route not found' } };
      }

      const validated = updateAlertRouteSchema.parse(request.body);
      const updated = await routeRepo.update(route.id, validated);

      await auditRepo.log(
        request.user.tenant_id,
        request.user.sub,
        'UPDATE',
        'alert_route',
        route.id,
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
    Params: { policyId: string; routeId: string };
  }>(
    '/api/policies/:policyId/alert-routes/:routeId',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('security-admin', 'platform-admin', 'integrations-admin'),
      ],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const policyRepo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const routeRepo = fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const policy = await policyRepo.findById(request.params.policyId);
      const route = await routeRepo.findById(request.params.routeId);

      if (!policy || policy.tenant_id !== request.user.tenant_id || !route || route.policy_id !== policy.id) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Alert route not found' } };
      }

      await routeRepo.delete(route.id);
      await auditRepo.log(
        request.user.tenant_id,
        request.user.sub,
        'DELETE',
        'alert_route',
        route.id,
        {
          policy_id: policy.id,
          channel: route.channel,
        },
        request.ip || undefined
      );

      return {
        success: true,
        data: { deleted: true },
      };
    }
  );

  fastify.post(
    '/api/incidents/escalations/run',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('operator', 'security-admin', 'platform-admin'),
      ],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const incidentRepo = fastify.diContainer.cradle.incidentRepository as IncidentRepository;
      const policyRepo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const routeRepo = fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const incidentResult = await incidentRepo.findAll(
        { tenant_id: request.user.tenant_id },
        { limit: 200, offset: 0 }
      );
      const policyResult = await policyRepo.findByTenantId(request.user.tenant_id, {
        limit: 200,
        offset: 0,
      });

      const escalatedIncidents = [];

      for (const incident of incidentResult.data) {
        if (!['open', 'acknowledged', 'investigating'].includes(incident.status)) {
          continue;
        }
        if (incident.acknowledged_at) {
          continue;
        }

        const policies = resolvePoliciesForIncident(incident, policyResult.data);
        const routes = (await Promise.all(policies.map((policy) => routeRepo.findByPolicyId(policy.id)))).flat();
        const dueAt = policies
          .map((policy) => escalationDueAt(policy, routes.filter((route) => route.policy_id === policy.id), incident.created_at))
          .filter((value): value is number => value !== null)
          .sort((left, right) => left - right)[0] ?? null;

        if (!dueAt || dueAt > Date.now()) {
          continue;
        }

        const updatedIncident = await incidentRepo.update(incident.id, {
          escalation_state: incident.escalation_state === 'critical' ? 'critical' : 'escalated',
          updated_at: new Date().toISOString(),
        });
        const dispatchResults = await dispatchAlerts({
          auditRepository: auditRepo,
          tenantId: request.user.tenant_id,
          actorUserId: request.user.sub,
          incident: updatedIncident ?? incident,
          policies,
          routes,
          stage: 'escalation',
        });

        escalatedIncidents.push({
          incident: updatedIncident ?? incident,
          alerts: dispatchResults,
        });
      }

      return {
        success: true,
        data: {
          processed: escalatedIncidents.length,
          incidents: escalatedIncidents,
        },
      };
    }
  );
}, {
  name: 'alert-routes-routes',
});
