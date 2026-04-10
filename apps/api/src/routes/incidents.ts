import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  EventRepository,
  EnrichmentRepository,
  IncidentRepository,
  AuditLogRepository,
  CameraRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';

const paginationSchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  status: z.string().optional(),
  severity: z.string().optional(),
  site_id: z.string().optional(),
});

export default fp(
  async (fastify: FastifyInstance) => {
    // GET /api/incidents - List incidents (paginated, filtered)
    fastify.get<{
      Querystring: z.infer<typeof paginationSchema>;
    }>(
      '/api/incidents',
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

        const query = paginationSchema.parse(request.query);
        const incidentRepo = fastify.diContainer
          .cradle.incidentRepository as IncidentRepository;
        const page = parseInt(query.page, 10);
        const pageSize = parseInt(query.pageSize, 10);
        const offset = (page - 1) * pageSize;

        let result;

        // Filter by status if provided
        if (query.status) {
          result = await incidentRepo.findByStatus(request.user.tenant_id, query.status as any, {
            limit: pageSize,
            offset,
          });
        } else {
          // Get all incidents for tenant
          result = await incidentRepo.findAll(
            { tenant_id: request.user.tenant_id },
            { limit: pageSize, offset }
          );
        }

        // Filter by severity if provided (client-side filtering since repo doesn't have findBySeverity)
        let filteredData = result.data;
        if (query.severity) {
          filteredData = result.data.filter((incident) => incident.severity === query.severity);
        }

        // Filter by site_id if provided
        if (query.site_id) {
          filteredData = filteredData.filter((incident) => incident.site_id === query.site_id);
        }

        return {
          success: true,
          data: {
            data: filteredData,
            page,
            pageSize,
            total: result.total,
            hasMore: offset + pageSize < result.total,
          },
        };
      }
    );

    // GET /api/incidents/:id - Get incident detail
    fastify.get<{
      Params: { id: string };
    }>(
      '/api/incidents/:id',
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

        const incidentRepo = fastify.diContainer
          .cradle.incidentRepository as IncidentRepository;
        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const eventRepo = fastify.diContainer.cradle.eventRepository as EventRepository;
        const enrichmentRepo = fastify.diContainer.cradle
          .enrichmentRepository as EnrichmentRepository;

        const incident = await incidentRepo.findById(request.params.id);
        if (!incident) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Incident not found',
            },
          };
        }

        // Verify tenant ownership
        if (incident.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        // Fetch linked cameras
        const cameras = await Promise.all(
          incident.camera_ids.map((cameraId) => cameraRepo.findById(cameraId))
        );
        const linkedEvents = (
          await Promise.all(
            (incident.linked_event_ids ?? []).map((eventId) => eventRepo.findById(eventId))
          )
        ).filter((event): event is NonNullable<typeof event> => Boolean(event));
        const enrichments = await enrichmentRepo.findByIncidentId(incident.id);

        const responseData = {
          ...incident,
          cameras: cameras.filter((c) => c !== null),
          linked_events: linkedEvents,
          enrichments,
        };

        return {
          success: true,
          data: responseData,
        };
      }
    );

    // POST /api/incidents/:id/ack - Acknowledge incident
    fastify.post<{
      Params: { id: string };
    }>(
      '/api/incidents/:id/ack',
      { preHandler: [fastify.authenticate, requireRole('operator', 'security-admin', 'platform-admin')] },
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

        const incidentRepo = fastify.diContainer
          .cradle.incidentRepository as IncidentRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingIncident = await incidentRepo.findById(request.params.id);
        if (!existingIncident) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Incident not found',
            },
          };
        }

        // Verify tenant ownership
        if (existingIncident.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const acknowledged = await incidentRepo.acknowledge(request.params.id, request.user.sub);

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'ACKNOWLEDGE',
          'incident',
          request.params.id,
          { previous_status: existingIncident.status },
          request.ip || undefined
        );

        return {
          success: true,
          data: acknowledged,
        };
      }
    );

    // POST /api/incidents/:id/escalate - Escalate incident
    fastify.post<{
      Params: { id: string };
    }>(
      '/api/incidents/:id/escalate',
      { preHandler: [fastify.authenticate, requireRole('operator', 'platform-admin')] },
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

        const incidentRepo = fastify.diContainer
          .cradle.incidentRepository as IncidentRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingIncident = await incidentRepo.findById(request.params.id);
        if (!existingIncident) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Incident not found',
            },
          };
        }

        // Verify tenant ownership
        if (existingIncident.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const escalated = await incidentRepo.escalate(request.params.id);

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'ESCALATE',
          'incident',
          request.params.id,
          { previous_state: existingIncident.escalation_state },
          request.ip || undefined
        );

        return {
          success: true,
          data: escalated,
        };
      }
    );

    // POST /api/incidents/:id/close - Close incident
    fastify.post<{
      Params: { id: string };
    }>(
      '/api/incidents/:id/close',
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

        const incidentRepo = fastify.diContainer
          .cradle.incidentRepository as IncidentRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingIncident = await incidentRepo.findById(request.params.id);
        if (!existingIncident) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Incident not found',
            },
          };
        }

        // Verify tenant ownership
        if (existingIncident.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const closed = await incidentRepo.close(request.params.id);

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'CLOSE',
          'incident',
          request.params.id,
          { previous_status: existingIncident.status },
          request.ip || undefined
        );

        return {
          success: true,
          data: closed,
        };
      }
    );
  },
  {
    name: 'incidents-routes',
  }
);
