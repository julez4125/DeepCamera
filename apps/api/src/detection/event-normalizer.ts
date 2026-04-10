import { randomUUID } from 'node:crypto';
import type {
  Camera,
  EventRecord,
  Policy,
  Site,
  Zone,
} from '../db/repositories/index.js';

export interface DetectionInput {
  label: string;
  confidence: number;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zone_ids?: string[];
}

export interface DetectionIngestInput {
  camera: Camera;
  site: Site;
  tenantId: string;
  timestamp: string;
  detections: DetectionInput[];
  policies: Policy[];
  zones: Zone[];
  snapshotId?: string | null;
  clipId?: string | null;
  recordingId?: string | null;
  metrics?: {
    model?: string;
    processing_ms?: number;
    fps?: number;
  };
  correlationId?: string;
}

export interface MatchedPolicy {
  policy: Policy;
  matched_labels: string[];
  matched_zone_ids: string[];
  severity: EventRecord['severity'];
}

function isPolicyArmed(policy: Policy): boolean {
  return policy.enabled && policy.armed_state !== 'disarmed';
}

function isScheduleActive(schedule: Record<string, unknown>, timestamp: string): boolean {
  const mode = schedule['mode'];
  if (!mode || mode === '24x7') {
    return true;
  }

  const date = new Date(timestamp);
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getUTCDay()] ?? 'sun';
  const days = Array.isArray(schedule['days']) ? schedule['days'].map(String) : null;
  if (days && !days.includes(weekday)) {
    return false;
  }

  const startHour = typeof schedule['start_hour'] === 'number' ? schedule['start_hour'] : 0;
  const endHour = typeof schedule['end_hour'] === 'number' ? schedule['end_hour'] : 24;
  const currentHour = date.getUTCHours();
  return currentHour >= startHour && currentHour < endHour;
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function deriveSeverity(
  policy: Policy,
  detections: DetectionInput[],
  matchedZoneIds: string[]
): EventRecord['severity'] {
  const rules = policy.severity_rules ?? {};
  const firstDetection = detections[0];
  const labelSeverity =
    firstDetection && typeof rules[firstDetection.label] === 'string'
      ? String(rules[firstDetection.label])
      : null;
  const zoneSeverity =
    matchedZoneIds.length > 0 && typeof rules['zone'] === 'string' ? String(rules['zone']) : null;
  const fallback = typeof rules['default'] === 'string' ? String(rules['default']) : 'medium';
  const value = labelSeverity ?? zoneSeverity ?? fallback;

  switch (value) {
    case 'info':
    case 'low':
    case 'medium':
    case 'high':
    case 'critical':
      return value;
    default:
      return 'medium';
  }
}

export function normalizeDetectionEvent(input: DetectionIngestInput): {
  event: EventRecord;
  matchedPolicies: MatchedPolicy[];
} {
  const activePolicies = input.policies.filter(
    (policy) => isPolicyArmed(policy) && isScheduleActive(policy.schedule ?? {}, input.timestamp)
  );

  const matchedPolicies = activePolicies
    .map((policy) => {
      const conditions = policy.conditions ?? {};
      const requiredLabels = Array.isArray(conditions['object_classes'])
        ? conditions['object_classes'].map(String)
        : Array.isArray(conditions['labels'])
          ? conditions['labels'].map(String)
          : [];
      const minConfidence =
        typeof conditions['min_confidence'] === 'number' ? conditions['min_confidence'] : 0;
      const requiredZoneTypes = Array.isArray(conditions['zones'])
        ? conditions['zones'].map(String)
        : [];
      const requiredZoneIds = Array.isArray(conditions['zone_ids'])
        ? conditions['zone_ids'].map(String)
        : requiredZoneTypes.length > 0
          ? input.zones
              .filter((zone) => requiredZoneTypes.includes(zone.zone_type))
              .map((zone) => zone.id)
          : [];

      const matchingDetections = input.detections.filter((detection) => {
        if (detection.confidence < minConfidence) {
          return false;
        }
        if (requiredLabels.length > 0 && !requiredLabels.includes(detection.label)) {
          return false;
        }
        if (requiredZoneIds.length > 0) {
          const zoneIds = detection.zone_ids ?? [];
          return intersect(zoneIds, requiredZoneIds).length > 0;
        }
        return true;
      });

      if (matchingDetections.length === 0) {
        return null;
      }

      const matchedZoneIds = Array.from(
        new Set(matchingDetections.flatMap((detection) => detection.zone_ids ?? []))
      );

      return {
        policy,
        matched_labels: Array.from(new Set(matchingDetections.map((detection) => detection.label))),
        matched_zone_ids: matchedZoneIds,
        severity: deriveSeverity(policy, matchingDetections, matchedZoneIds),
      };
    })
    .filter((policy): policy is MatchedPolicy => Boolean(policy));

  const severityOrder: EventRecord['severity'][] = ['info', 'low', 'medium', 'high', 'critical'];
  const highestSeverity = matchedPolicies.reduce<EventRecord['severity']>(
    (current, match) =>
      severityOrder.indexOf(match.severity) > severityOrder.indexOf(current)
        ? match.severity
        : current,
    'medium'
  );

  const correlationId = input.correlationId ?? randomUUID();
  const event: EventRecord = {
    id: randomUUID(),
    camera_id: input.camera.id,
    site_id: input.site.id,
    tenant_id: input.tenantId,
    event_type: 'detection.created',
    timestamp: input.timestamp,
    severity: highestSeverity,
    correlation_id: correlationId,
    created_at: new Date().toISOString(),
    payload: {
      snapshot_id: input.snapshotId ?? null,
      clip_id: input.clipId ?? null,
      recording_id: input.recordingId ?? null,
      model: input.metrics?.model ?? 'detector-yolo-fallback',
      processing_ms: input.metrics?.processing_ms ?? null,
      fps: input.metrics?.fps ?? null,
      detections: input.detections,
      policy_matches: matchedPolicies.map((match) => ({
        policy_id: match.policy.id,
        policy_name: match.policy.name,
        severity: match.severity,
        matched_labels: match.matched_labels,
        matched_zone_ids: match.matched_zone_ids,
      })),
    },
  };

  return {
    event,
    matchedPolicies,
  };
}
