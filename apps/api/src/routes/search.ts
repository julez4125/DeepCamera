import { randomUUID } from 'node:crypto';
import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  CameraRepository,
  ClipRepository,
  EnrichmentRecord,
  EnrichmentRepository,
  EventRepository,
  IncidentRepository,
  RecordingRepository,
  SearchDocumentRepository,
  SnapshotRepository,
} from '../db/repositories/index.js';
import {
  buildQueuedEnrichmentRecord,
  deriveCandidateTargets,
} from '../enrichment/candidate-pipeline.js';
import { completeEnrichment } from '../enrichment/vlm-enricher.js';
import { buildSearchDocuments } from '../search/indexer.js';
import { scoreSearchDocument } from '../search/semantic-search.js';
import { requireRole } from '../auth/index.js';

const searchQuerySchema = z.object({
  q: z.string().optional().default(''),
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  site_id: z.string().uuid().optional(),
  camera_id: z.string().uuid().optional(),
  severity: z.string().optional(),
  source_type: z.enum(['incident', 'event', 'clip']).optional(),
});

const enrichmentQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  incident_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
});

async function queueCandidatesForTenant(
  tenantId: string,
  incidentRepository: IncidentRepository,
  eventRepository: EventRepository,
  enrichmentRepository: EnrichmentRepository
): Promise<{ queued: number; skipped: number; items: EnrichmentRecord[] }> {
  const [incidentsPage, eventsPage] = await Promise.all([
    incidentRepository.findAll({ tenant_id: tenantId }, { limit: 200, offset: 0 }),
    eventRepository.findByTenantId(tenantId, { limit: 200, offset: 0 }),
  ]);

  const queuedItems: EnrichmentRecord[] = [];
  let skipped = 0;
  const targets = deriveCandidateTargets(incidentsPage.data, eventsPage.data);

  for (const target of targets) {
    const existing = await enrichmentRepository.findBySource(
      tenantId,
      target.source_type,
      target.source_id
    );

    if (existing) {
      queuedItems.push(existing);
      skipped += 1;
      continue;
    }

    const queued = await enrichmentRepository.create({
      id: randomUUID(),
      ...buildQueuedEnrichmentRecord(tenantId, target, new Date().toISOString()),
    });
    queuedItems.push(queued);
  }

  return {
    queued: queuedItems.length - skipped,
    skipped,
    items: queuedItems,
  };
}

async function rebuildSearchIndex(
  tenantId: string,
  searchRepository: SearchDocumentRepository,
  enrichmentRepository: EnrichmentRepository,
  incidentRepository: IncidentRepository,
  eventRepository: EventRepository,
  clipRepository: ClipRepository,
  cameraRepository: CameraRepository
): Promise<void> {
  const [incidentsPage, eventsPage, enrichmentsPage, camerasPage] = await Promise.all([
    incidentRepository.findAll({ tenant_id: tenantId }, { limit: 200, offset: 0 }),
    eventRepository.findByTenantId(tenantId, { limit: 200, offset: 0 }),
    enrichmentRepository.findByTenantId(tenantId, { limit: 200, offset: 0 }),
    cameraRepository.findAll({}, { limit: 200, offset: 0 }),
  ]);

  const clipIds = new Set<string>();
  for (const incident of incidentsPage.data) {
    for (const reference of incident.evidence_references) {
      if (reference.clip_id) {
        clipIds.add(reference.clip_id);
      }
    }
  }
  for (const event of eventsPage.data) {
    if (typeof event.payload['clip_id'] === 'string') {
      clipIds.add(event.payload['clip_id']);
    }
  }

  const clips = (
    await Promise.all(Array.from(clipIds).map((clipId) => clipRepository.findById(clipId)))
  ).filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));

  const documents = buildSearchDocuments({
    incidents: incidentsPage.data,
    events: eventsPage.data,
    enrichments: enrichmentsPage.data,
    clips,
    cameras: camerasPage.data.filter((camera) => camera.site_id !== ''),
  });

  for (const document of documents) {
    const existing = await searchRepository.findBySource(
      tenantId,
      document.source_type,
      document.source_id
    );

    if (existing) {
      await searchRepository.update(existing.id, {
        ...document,
        id: existing.id,
      });
      continue;
    }

    await searchRepository.create(document);
  }
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Querystring: z.infer<typeof searchQuerySchema>;
  }>(
    '/api/search',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const query = searchQuerySchema.parse(request.query);
      const searchRepository = fastify.diContainer.cradle
        .searchDocumentRepository as SearchDocumentRepository;
      const page = parseInt(query.page, 10);
      const pageSize = parseInt(query.pageSize, 10);
      const offset = (page - 1) * pageSize;
      const baseResult = await searchRepository.findByTenantId(
        request.user.tenant_id,
        { limit: 200, offset: 0 },
        {
          site_id: query.site_id,
          camera_id: query.camera_id,
          severity: query.severity,
          source_type: query.source_type,
        }
      );

      const rescored = baseResult.data
        .map((document) => {
          const searchScore = scoreSearchDocument(document, query.q);
          return {
            ...document,
            score: Number(searchScore.score.toFixed(4)),
            matched_terms: searchScore.matchedTerms,
          };
        })
        .filter((document) => query.q.trim().length === 0 || document.score > 0.12)
        .sort((left, right) => right.score - left.score || right.occurred_at.localeCompare(left.occurred_at));

      return {
        success: true,
        data: {
          data: rescored.slice(offset, offset + pageSize),
          page,
          pageSize,
          total: rescored.length,
          hasMore: offset + pageSize < rescored.length,
        },
      };
    }
  );

  fastify.get<{
    Querystring: z.infer<typeof enrichmentQuerySchema>;
  }>(
    '/api/search/enrichments',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const query = enrichmentQuerySchema.parse(request.query);
      const enrichmentRepository = fastify.diContainer.cradle
        .enrichmentRepository as EnrichmentRepository;
      const page = parseInt(query.page, 10);
      const pageSize = parseInt(query.pageSize, 10);
      const offset = (page - 1) * pageSize;
      const result = await enrichmentRepository.findByTenantId(
        request.user.tenant_id,
        { limit: pageSize, offset },
        {
          incident_id: query.incident_id,
          event_id: query.event_id,
          status: query.status,
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

  fastify.post(
    '/api/search/enrichments/run',
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

      const enrichmentRepository = fastify.diContainer.cradle
        .enrichmentRepository as EnrichmentRepository;
      const incidentRepository = fastify.diContainer.cradle
        .incidentRepository as IncidentRepository;
      const eventRepository = fastify.diContainer.cradle.eventRepository as EventRepository;
      const clipRepository = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const recordingRepository = fastify.diContainer.cradle
        .recordingRepository as RecordingRepository;
      const snapshotRepository = fastify.diContainer.cradle
        .snapshotRepository as SnapshotRepository;
      const searchRepository = fastify.diContainer.cradle
        .searchDocumentRepository as SearchDocumentRepository;
      const cameraRepository = fastify.diContainer.cradle.cameraRepository as CameraRepository;

      const queueResult = await queueCandidatesForTenant(
        request.user.tenant_id,
        incidentRepository,
        eventRepository,
        enrichmentRepository
      );

      let processed = 0;
      for (const enrichment of queueResult.items.filter((item) => item.status === 'queued')) {
        const [incident, event, clip, recording, snapshot] = await Promise.all([
          enrichment.incident_id ? incidentRepository.findById(enrichment.incident_id) : Promise.resolve(null),
          enrichment.event_id ? eventRepository.findById(enrichment.event_id) : Promise.resolve(null),
          enrichment.clip_id ? clipRepository.findById(enrichment.clip_id) : Promise.resolve(null),
          enrichment.recording_id
            ? recordingRepository.findById(enrichment.recording_id)
            : Promise.resolve(null),
          enrichment.snapshot_id
            ? snapshotRepository.findById(enrichment.snapshot_id)
            : Promise.resolve(null),
        ]);

        const completion = completeEnrichment({
          enrichment,
          incident,
          event,
          clip,
          recording,
          snapshot,
        });

        await enrichmentRepository.update(enrichment.id, completion);
        processed += 1;
      }

      await rebuildSearchIndex(
        request.user.tenant_id,
        searchRepository,
        enrichmentRepository,
        incidentRepository,
        eventRepository,
        clipRepository,
        cameraRepository
      );

      const enrichmentsPage = await enrichmentRepository.findByTenantId(
        request.user.tenant_id,
        { limit: 100, offset: 0 }
      );

      return {
        success: true,
        data: {
          queued: queueResult.queued,
          skipped: queueResult.skipped,
          processed,
          enrichments: enrichmentsPage.data,
        },
      };
    }
  );
}, {
  name: 'search-routes',
});
