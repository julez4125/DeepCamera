import { randomUUID } from 'node:crypto';
import type {
  Camera,
  Clip,
  EnrichmentRecord,
  EventRecord,
  Incident,
  SearchDocument,
} from '../db/repositories/index.js';
import { tokenizeSemanticText } from './semantic-search.js';

interface BuildSearchDocumentsParams {
  incidents: Incident[];
  events: EventRecord[];
  enrichments: EnrichmentRecord[];
  clips: Clip[];
  cameras: Camera[];
}

function findEnrichment(
  enrichments: EnrichmentRecord[],
  sourceType: 'incident' | 'event',
  sourceId: string
): EnrichmentRecord | null {
  return (
    enrichments.find(
      (enrichment) =>
        enrichment.source_type === sourceType &&
        enrichment.source_id === sourceId &&
        enrichment.status === 'completed'
    ) ?? null
  );
}

function summarizeDetectionLabels(event: EventRecord): string {
  if (!Array.isArray(event.payload['detections'])) {
    return 'activity';
  }

  const labels = event.payload['detections'].flatMap((detection) => {
    if (!detection || typeof detection !== 'object') {
      return [];
    }

    const label = (detection as { label?: unknown }).label;
    return typeof label === 'string' ? [label] : [];
  });

  return labels.length > 0 ? Array.from(new Set(labels)).join(', ') : 'activity';
}

export function buildSearchDocuments({
  incidents,
  events,
  enrichments,
  clips,
  cameras,
}: BuildSearchDocumentsParams): SearchDocument[] {
  const now = new Date().toISOString();
  const cameraMap = new Map(cameras.map((camera) => [camera.id, camera]));

  const incidentDocuments = incidents.map<SearchDocument>((incident) => {
    const enrichment = findEnrichment(enrichments, 'incident', incident.id);
    const keywords = Array.from(
      new Set([
        incident.category,
        incident.severity,
        ...incident.camera_ids.map((cameraId) => cameraMap.get(cameraId)?.name ?? cameraId),
        ...(enrichment?.keywords ?? []),
      ].filter((value): value is string => Boolean(value)))
    );

    return {
      id: randomUUID(),
      tenant_id: incident.tenant_id,
      site_id: incident.site_id,
      source_type: 'incident',
      source_id: incident.id,
      incident_id: incident.id,
      event_id: incident.linked_event_ids[0] ?? null,
      clip_id: incident.evidence_references.find((reference) => reference.clip_id)?.clip_id ?? null,
      camera_ids: incident.camera_ids,
      severity: incident.severity,
      title: `${incident.severity.toUpperCase()} ${incident.category} incident`,
      summary: incident.summary,
      occurred_at: incident.timeline_start,
      keywords,
      semantic_terms: tokenizeSemanticText([
        incident.summary,
        incident.category,
        keywords.join(' '),
        enrichment?.summary ?? '',
      ]),
      matched_terms: [],
      score: 0,
      vlm_summary: enrichment?.summary ?? null,
      suspicious_context: enrichment?.suspicious_context ?? [],
      created_at: now,
      updated_at: now,
    };
  });

  const eventDocuments = events.map<SearchDocument>((event) => {
    const enrichment = findEnrichment(enrichments, 'event', event.id);
    const labelSummary = summarizeDetectionLabels(event);
    const cameraName = cameraMap.get(event.camera_id)?.name ?? event.camera_id;

    return {
      id: randomUUID(),
      tenant_id: event.tenant_id,
      site_id: event.site_id,
      source_type: 'event',
      source_id: event.id,
      incident_id: null,
      event_id: event.id,
      clip_id: typeof event.payload['clip_id'] === 'string' ? event.payload['clip_id'] : null,
      camera_ids: [event.camera_id],
      severity: event.severity,
      title: `${labelSummary} detection on ${cameraName}`,
      summary: `Detection event ${event.event_type} captured ${labelSummary}.`,
      occurred_at: event.timestamp,
      keywords: Array.from(new Set([labelSummary, event.severity, cameraName, ...(enrichment?.keywords ?? [])])),
      semantic_terms: tokenizeSemanticText([
        event.event_type,
        labelSummary,
        cameraName,
        enrichment?.summary ?? '',
      ]),
      matched_terms: [],
      score: 0,
      vlm_summary: enrichment?.summary ?? null,
      suspicious_context: enrichment?.suspicious_context ?? [],
      created_at: now,
      updated_at: now,
    };
  });

  const clipDocuments = clips.map<SearchDocument>((clip) => {
    const relatedIncident = incidents.find((incident) =>
      incident.evidence_references.some((reference) => reference.clip_id === clip.id)
    );
    const relatedEvent = events.find((event) => event.payload['clip_id'] === clip.id);
    const enrichment =
      (relatedIncident ? findEnrichment(enrichments, 'incident', relatedIncident.id) : null) ??
      (relatedEvent ? findEnrichment(enrichments, 'event', relatedEvent.id) : null);
    const camera = cameraMap.get(clip.camera_id);
    const keywords = Array.from(
      new Set([
        'clip',
        relatedIncident?.category,
        relatedIncident?.severity,
        camera?.name ?? clip.camera_id,
        ...(enrichment?.keywords ?? []),
      ].filter((value): value is string => Boolean(value)))
    );

    return {
      id: randomUUID(),
      tenant_id: relatedIncident?.tenant_id ?? relatedEvent?.tenant_id ?? '',
      site_id: relatedIncident?.site_id ?? relatedEvent?.site_id ?? '',
      source_type: 'clip',
      source_id: clip.id,
      incident_id: relatedIncident?.id ?? null,
      event_id: relatedEvent?.id ?? null,
      clip_id: clip.id,
      camera_ids: [clip.camera_id],
      severity: relatedIncident?.severity ?? relatedEvent?.severity ?? null,
      title: `Clip evidence from ${camera?.name ?? clip.camera_id}`,
      summary: enrichment?.summary ?? 'Clip evidence associated with a monitored incident.',
      occurred_at: clip.start_time,
      keywords,
      semantic_terms: tokenizeSemanticText([keywords.join(' '), enrichment?.summary ?? 'clip evidence']),
      matched_terms: [],
      score: 0,
      vlm_summary: enrichment?.summary ?? null,
      suspicious_context: enrichment?.suspicious_context ?? [],
      created_at: now,
      updated_at: now,
    };
  });

  return [...incidentDocuments, ...eventDocuments, ...clipDocuments].filter(
    (document) => document.tenant_id && document.site_id
  );
}
