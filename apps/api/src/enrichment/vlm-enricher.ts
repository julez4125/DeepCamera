import type {
  Clip,
  EnrichmentRecord,
  EventRecord,
  Incident,
  Recording,
  Snapshot,
} from '../db/repositories/index.js';
import { tokenizeSemanticText } from '../search/semantic-search.js';

interface EnrichmentContext {
  enrichment: EnrichmentRecord;
  incident: Incident | null;
  event: EventRecord | null;
  clip: Clip | null;
  recording: Recording | null;
  snapshot: Snapshot | null;
}

function formatLabels(event: EventRecord | null): string[] {
  if (!event || !Array.isArray(event.payload['detections'])) {
    return [];
  }

  return event.payload['detections'].flatMap((detection) => {
    if (!detection || typeof detection !== 'object') {
      return [];
    }

    const label = (detection as { label?: unknown }).label;
    return typeof label === 'string' ? [label] : [];
  });
}

function deriveSuspiciousContext(context: EnrichmentContext): string[] {
  const tags = new Set<string>();
  const timestamp = context.event?.timestamp ?? context.incident?.timeline_start;
  const hour = timestamp ? new Date(timestamp).getUTCHours() : null;

  if (hour !== null && (hour < 6 || hour >= 22)) {
    tags.add('after_hours');
  }

  if (context.incident?.category === 'intrusion' || context.event?.event_type === 'detection.created') {
    tags.add('restricted_zone');
  }

  if ((context.incident?.dedupe_count ?? 0) > 1) {
    tags.add('repeat_activity');
  }

  if (context.clip) {
    tags.add('clip_evidence');
  }

  if (context.recording) {
    tags.add('recording_available');
  }

  if (context.snapshot) {
    tags.add('snapshot_available');
  }

  return Array.from(tags);
}

function buildSummary(context: EnrichmentContext): string {
  const labels = formatLabels(context.event);
  const subject = labels.length > 0 ? labels.join(', ') : context.incident?.category ?? 'activity';
  const incidentSummary = context.incident?.summary;
  const evidenceParts = [
    context.clip ? 'clip evidence is attached' : null,
    context.recording ? 'full recording is available' : null,
    context.snapshot ? 'snapshot evidence is available' : null,
  ].filter((part): part is string => Boolean(part));

  const suspiciousContext = deriveSuspiciousContext(context);
  const posture = suspiciousContext.includes('after_hours')
    ? 'after hours'
    : suspiciousContext.includes('restricted_zone')
      ? 'inside a restricted area'
      : 'during routine monitoring';

  return [
    incidentSummary ?? `The scene contains ${subject}.`,
    `The fallback VLM summary flags activity ${posture}.`,
    evidenceParts.length > 0 ? `Supporting evidence: ${evidenceParts.join(', ')}.` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export function completeEnrichment(context: EnrichmentContext): Pick<
  EnrichmentRecord,
  'status' | 'summary' | 'suspicious_context' | 'keywords' | 'semantic_terms' | 'started_at' | 'completed_at' | 'updated_at' | 'error_message'
> {
  const timestamp = new Date().toISOString();
  const summary = buildSummary(context);
  const suspiciousContext = deriveSuspiciousContext(context);
  const keywords = Array.from(
    new Set([
      ...(context.incident ? [context.incident.category, context.incident.severity] : []),
      ...formatLabels(context.event),
      ...suspiciousContext,
      ...(context.clip ? ['clip'] : []),
      ...(context.recording ? ['recording'] : []),
      ...(context.snapshot ? ['snapshot'] : []),
    ].filter((keyword): keyword is string => Boolean(keyword)))
  );

  return {
    status: 'completed',
    summary,
    suspicious_context: suspiciousContext,
    keywords,
    semantic_terms: tokenizeSemanticText([summary, keywords.join(' ')]),
    started_at: context.enrichment.started_at ?? timestamp,
    completed_at: timestamp,
    updated_at: timestamp,
    error_message: null,
  };
}
