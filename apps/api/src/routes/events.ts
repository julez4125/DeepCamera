import { randomUUID } from 'node:crypto';
import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  AlertRouteRepository,
  AuditLogRepository,
  CameraRepository,
  ClipRepository,
  EnrichmentRepository,
  EventRepository,
  IncidentRepository,
  PolicyRepository,
  RecordingRepository,
  SiteRepository,
  SnapshotRepository,
  ZoneRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import { normalizeDetectionEvent } from '../detection/event-normalizer.js';
import { aggregateIncidentFromEvent } from '../incidents/incident-engine.js';
import { dispatchAlerts } from '../alerting/alert-dispatcher.js';
import { buildQueuedEnrichmentRecord, deriveCandidateTargets } from '../enrichment/candidate-pipeline.js';
import type { EnrichmentRecord } from '../db/repositories/index.js';

const listEventsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  camera_id: z.string().uuid().optional(),
  event_type: z.string().optional(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

const ingestDetectionsSchema = z.object({
  camera_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  snapshot_id: z.string().uuid().nullable().optional(),
  clip_id: z.string().uuid().nullable().optional(),
  recording_id: z.string().uuid().nullable().optional(),
  detections: z.array(
    z.object({
      label: z.string().min(1),
      confidence: z.number().min(0).max(1),
      bounding_box: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      }),
      zone_ids: z.array(z.string().uuid()).optional(),
    })
  ).min(1),
  metrics: z
    .object({
      model: z.string().optional(),
      processing_ms: z.number().nonnegative().optional(),
      fps: z.number().nonnegative().optional(),
    })
    .optional(),
});

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Querystring: z.infer<typeof listEventsQuerySchema>;
  }>(
    '/api/events',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const query = listEventsQuerySchema.parse(request.query);
      const eventRepo = fastify.diContainer.cradle.eventRepository as EventRepository;
      const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
      const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;

      if (query.camera_id) {
        const camera = await cameraRepo.findById(query.camera_id);
        const site = camera ? await siteRepo.findById(camera.site_id) : null;
        if (!camera || !site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Camera not found' },
          };
        }
      }

      const page = parseInt(query.page, 10);
      const pageSize = parseInt(query.pageSize, 10);
      const offset = (page - 1) * pageSize;
      const result = await eventRepo.findByTenantId(
        request.user.tenant_id,
        {
          limit: pageSize,
          offset,
        },
        {
          camera_id: query.camera_id,
          event_type: query.event_type,
          severity: query.severity,
          date_from: query.date_from,
          date_to: query.date_to,
        }
      );

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
    Body: z.infer<typeof ingestDetectionsSchema>;
  }>(
    '/api/events/ingest-detections',
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

      const payload = ingestDetectionsSchema.parse(request.body);
      const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
      const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
      const zoneRepo = fastify.diContainer.cradle.zoneRepository as ZoneRepository;
      const policyRepo = fastify.diContainer.cradle.policyRepository as PolicyRepository;
      const eventRepo = fastify.diContainer.cradle.eventRepository as EventRepository;
      const incidentRepo = fastify.diContainer.cradle.incidentRepository as IncidentRepository;
      const enrichmentRepo = fastify.diContainer.cradle
        .enrichmentRepository as EnrichmentRepository;
      const alertRouteRepo = fastify.diContainer.cradle.alertRouteRepository as AlertRouteRepository;
      const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;
      const snapshotRepo = fastify.diContainer.cradle.snapshotRepository as SnapshotRepository;
      const clipRepo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const recordingRepo = fastify.diContainer.cradle.recordingRepository as RecordingRepository;

      const camera = await cameraRepo.findById(payload.camera_id);
      const site = camera ? await siteRepo.findById(camera.site_id) : null;
      if (!camera || !site || site.tenant_id !== request.user.tenant_id) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Camera not found' },
        };
      }

      const [zonesPage, tenantPoliciesPage, sitePoliciesPage, snapshot, clip, recording] =
        await Promise.all([
          zoneRepo.findBySiteId(site.id, { limit: 100, offset: 0 }),
          policyRepo.findByTenantId(request.user.tenant_id, { limit: 200, offset: 0 }),
          policyRepo.findBySiteId(site.id, { limit: 200, offset: 0 }),
          payload.snapshot_id ? snapshotRepo.findById(payload.snapshot_id) : Promise.resolve(null),
          payload.clip_id ? clipRepo.findById(payload.clip_id) : Promise.resolve(null),
          payload.recording_id ? recordingRepo.findById(payload.recording_id) : Promise.resolve(null),
        ]);

      const policyMap = new Map<string, (typeof tenantPoliciesPage.data)[number]>();
      for (const policy of [...tenantPoliciesPage.data, ...sitePoliciesPage.data]) {
        if (policy.tenant_id === request.user.tenant_id) {
          policyMap.set(policy.id, policy);
        }
      }

      const normalized = normalizeDetectionEvent({
        camera,
        site,
        tenantId: request.user.tenant_id,
        timestamp: payload.timestamp,
        detections: payload.detections,
        policies: Array.from(policyMap.values()),
        zones: zonesPage.data,
        snapshotId: payload.snapshot_id ?? null,
        clipId: payload.clip_id ?? null,
        recordingId: payload.recording_id ?? null,
        metrics: payload.metrics,
      });

      const storedEvent = await eventRepo.create(normalized.event);
      const incidentResult = await aggregateIncidentFromEvent({
        incidentRepository: incidentRepo,
        event: storedEvent,
        matchedPolicies: normalized.matchedPolicies,
        snapshot,
        clip,
        recording,
      });

      const policyIds = normalized.matchedPolicies.map((match) => match.policy.id);
      const routes = (
        await Promise.all(policyIds.map((policyId) => alertRouteRepo.findByPolicyId(policyId)))
      ).flat();
      const candidateTargets = deriveCandidateTargets([incidentResult.incident], [storedEvent]);
      const queuedEnrichments: EnrichmentRecord[] = [];

      for (const target of candidateTargets) {
        const existing = await enrichmentRepo.findBySource(
          request.user.tenant_id,
          target.source_type,
          target.source_id
        );

        if (existing) {
          queuedEnrichments.push(existing);
          continue;
        }

        const queued = await enrichmentRepo.create({
          id: randomUUID(),
          ...buildQueuedEnrichmentRecord(request.user.tenant_id, target, new Date().toISOString()),
        });
        queuedEnrichments.push(queued);
      }

      const alerts = await dispatchAlerts({
        auditRepository: auditRepo,
        tenantId: request.user.tenant_id,
        actorUserId: request.user.sub,
        incident: incidentResult.incident,
        policies: normalized.matchedPolicies.map((match) => match.policy),
        routes,
        stage: 'initial',
      });

      reply.code(201);
      return {
        success: true,
        data: {
          event: storedEvent,
          incident: incidentResult.incident,
          deduped: incidentResult.deduped,
          matched_policies: normalized.matchedPolicies,
          queued_enrichments: queuedEnrichments,
          alerts,
        },
      };
    }
  );
}, {
  name: 'events-routes',
});
