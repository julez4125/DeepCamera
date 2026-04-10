import { randomUUID } from 'node:crypto';
import type {
  Clip,
  EventRecord,
  Incident,
  IncidentRepository,
  Policy,
  Recording,
  Snapshot,
} from '../db/repositories/index.js';
import type { MatchedPolicy } from '../detection/event-normalizer.js';

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function confidenceFromDetections(event: EventRecord): number {
  const detections = Array.isArray(event.payload['detections']) ? event.payload['detections'] : [];
  const confidences = detections
    .map((item) =>
      typeof item === 'object' && item !== null && typeof item['confidence'] === 'number'
        ? item['confidence']
        : null
    )
    .filter((value): value is number => value !== null);

  if (confidences.length === 0) {
    return 0.5;
  }

  return Math.max(...confidences);
}

function severityRank(severity: Incident['severity']): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function highestSeverity(
  current: Incident['severity'],
  next: Incident['severity']
): Incident['severity'] {
  return severityRank(next) > severityRank(current) ? next : current;
}

function buildEvidenceReferences(input: {
  snapshot: Snapshot | null;
  clip: Clip | null;
  recording: Recording | null;
}): Incident['evidence_references'] {
  const references: Incident['evidence_references'] = [];

  if (input.snapshot) {
    references.push({
      kind: 'snapshot',
      snapshot_id: input.snapshot.id,
      clip_id: null,
      recording_id: null,
      path: input.snapshot.storage_path,
      preview_url: input.snapshot.storage_path,
    });
  }

  if (input.clip) {
    references.push({
      kind: 'clip',
      snapshot_id: null,
      clip_id: input.clip.id,
      recording_id: null,
      path: input.clip.file_path,
      preview_url: input.clip.thumbnail_path ?? undefined,
      playback_url: `/api/media/clips/${input.clip.id}/playback`,
    });
  }

  if (input.recording) {
    references.push({
      kind: 'recording',
      snapshot_id: null,
      clip_id: null,
      recording_id: input.recording.id,
      path: input.recording.file_path ?? `recording:${input.recording.id}`,
      playback_url: `/api/media/recordings/${input.recording.id}/playback`,
    });
  }

  return references;
}

export async function aggregateIncidentFromEvent(input: {
  incidentRepository: IncidentRepository;
  event: EventRecord;
  matchedPolicies: MatchedPolicy[];
  snapshot: Snapshot | null;
  clip: Clip | null;
  recording: Recording | null;
}): Promise<{ incident: Incident; deduped: boolean }> {
  const severity = (input.matchedPolicies[0]?.severity ?? input.event.severity) as Incident['severity'];
  const category = input.matchedPolicies[0]?.matched_labels[0] ?? 'detection';
  const summary = input.matchedPolicies.length > 0
    ? `${input.matchedPolicies[0]!.policy.name}: ${category} detected`
    : `${category} detected`;
  const evidence = buildEvidenceReferences({
    snapshot: input.snapshot,
    clip: input.clip,
    recording: input.recording,
  });
  const policyHits = input.matchedPolicies.reduce<Record<string, unknown>>((acc, match) => {
    acc[match.policy.id] = {
      name: match.policy.name,
      severity: match.severity,
      matched_labels: match.matched_labels,
      matched_zone_ids: match.matched_zone_ids,
    };
    return acc;
  }, {});

  const existingIncidents = await input.incidentRepository.findAll(
    {
      tenant_id: input.event.tenant_id,
      site_id: input.event.site_id,
    },
    {
      limit: 200,
      offset: 0,
    }
  );

  const dedupeCandidate = existingIncidents.data.find((incident) => {
    if (!['open', 'acknowledged', 'investigating'].includes(incident.status)) {
      return false;
    }

    if (incident.category !== category) {
      return false;
    }

    if (!incident.camera_ids.includes(input.event.camera_id)) {
      return false;
    }

    const delta = Math.abs(
      Date.parse(incident.timeline_end) - Date.parse(input.event.timestamp)
    );
    return delta <= DEDUPE_WINDOW_MS;
  });

  if (dedupeCandidate) {
    const updated = await input.incidentRepository.update(dedupeCandidate.id, {
      confidence: Math.max(dedupeCandidate.confidence, confidenceFromDetections(input.event)),
      severity: highestSeverity(dedupeCandidate.severity, severity),
      timeline_end: input.event.timestamp,
      linked_event_ids: Array.from(
        new Set([...(dedupeCandidate.linked_event_ids ?? []), input.event.id])
      ),
      evidence_references: Array.from(
        new Map(
          [...(dedupeCandidate.evidence_references ?? []), ...evidence].map((reference) => [
            `${reference.kind}:${reference.path}`,
            reference,
          ])
        ).values()
      ),
      policy_hits: {
        ...(dedupeCandidate.policy_hits ?? {}),
        ...policyHits,
      },
      dedupe_count: (dedupeCandidate.dedupe_count ?? 1) + 1,
      updated_at: new Date().toISOString(),
    });

    return {
      incident: updated ?? dedupeCandidate,
      deduped: true,
    };
  }

  const created = await input.incidentRepository.create({
    id: randomUUID(),
    tenant_id: input.event.tenant_id,
    site_id: input.event.site_id,
    severity,
    confidence: confidenceFromDetections(input.event),
    category,
    summary,
    status: 'open',
    camera_ids: [input.event.camera_id],
    timeline_start: input.event.timestamp,
    timeline_end: input.event.timestamp,
    policy_hits: policyHits,
    escalation_state: input.matchedPolicies.some((match) => match.severity === 'critical')
      ? 'critical'
      : 'scheduled',
    linked_event_ids: [input.event.id],
    evidence_references: evidence,
    dedupe_count: 1,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return {
    incident: created,
    deduped: false,
  };
}

export function resolvePoliciesForIncident(
  incident: Incident,
  policies: Policy[]
): Policy[] {
  const policyIds = Object.keys(incident.policy_hits ?? {});
  return policies.filter((policy) => policyIds.includes(policy.id));
}
