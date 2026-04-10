import type { EnrichmentRecord, EventRecord, Incident } from '../db/repositories/index.js';

interface CandidateTarget {
  source_type: 'incident' | 'event';
  source_id: string;
  incident_id: string | null;
  event_id: string | null;
  clip_id: string | null;
  snapshot_id: string | null;
  recording_id: string | null;
}

function eventLabels(event: EventRecord): string[] {
  const detections = event.payload['detections'];
  if (!Array.isArray(detections)) {
    return [];
  }

  return detections.flatMap((detection) => {
    if (!detection || typeof detection !== 'object') {
      return [];
    }

    const label = (detection as { label?: unknown }).label;
    return typeof label === 'string' ? [label] : [];
  });
}

export function shouldEnrichIncident(incident: Incident): boolean {
  return (
    incident.status === 'open' ||
    incident.status === 'investigating' ||
    incident.severity === 'high' ||
    incident.severity === 'critical' ||
    incident.evidence_references.length > 0 ||
    incident.dedupe_count > 1
  );
}

export function shouldEnrichEvent(event: EventRecord): boolean {
  const labels = eventLabels(event);

  return (
    event.severity === 'high' ||
    event.severity === 'critical' ||
    labels.includes('person') ||
    labels.includes('vehicle') ||
    typeof event.payload['clip_id'] === 'string' ||
    typeof event.payload['recording_id'] === 'string'
  );
}

export function deriveCandidateTargets(
  incidents: Incident[],
  events: EventRecord[]
): CandidateTarget[] {
  const incidentTargets = incidents
    .filter(shouldEnrichIncident)
    .map<CandidateTarget>((incident) => ({
      source_type: 'incident',
      source_id: incident.id,
      incident_id: incident.id,
      event_id: incident.linked_event_ids[0] ?? null,
      clip_id: incident.evidence_references.find((reference) => reference.clip_id)?.clip_id ?? null,
      snapshot_id: incident.evidence_references.find((reference) => reference.snapshot_id)?.snapshot_id ?? null,
      recording_id:
        incident.evidence_references.find((reference) => reference.recording_id)?.recording_id ?? null,
    }));

  const eventTargets = events
    .filter(shouldEnrichEvent)
    .map<CandidateTarget>((event) => ({
      source_type: 'event',
      source_id: event.id,
      incident_id: null,
      event_id: event.id,
      clip_id: typeof event.payload['clip_id'] === 'string' ? event.payload['clip_id'] : null,
      snapshot_id:
        typeof event.payload['snapshot_id'] === 'string' ? event.payload['snapshot_id'] : null,
      recording_id:
        typeof event.payload['recording_id'] === 'string' ? event.payload['recording_id'] : null,
    }));

  return [...incidentTargets, ...eventTargets];
}

export function buildQueuedEnrichmentRecord(
  tenantId: string,
  target: CandidateTarget,
  timestamp: string
): Partial<EnrichmentRecord> {
  return {
    tenant_id: tenantId,
    source_type: target.source_type,
    source_id: target.source_id,
    incident_id: target.incident_id,
    event_id: target.event_id,
    clip_id: target.clip_id,
    snapshot_id: target.snapshot_id,
    recording_id: target.recording_id,
    status: 'queued',
    model: 'vlm-fallback-v1',
    summary: null,
    suspicious_context: [],
    keywords: [],
    semantic_terms: [],
    queued_at: timestamp,
    started_at: null,
    completed_at: null,
    error_message: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}
