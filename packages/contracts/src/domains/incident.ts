import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  incidentIdSchema,
  tenantIdSchema,
  siteIdSchema,
  cameraIdSchema,
  clipIdSchema,
  eventIdSchema,
  recordingIdSchema,
  snapshotIdSchema,
} from '../common/id';

export const incidentStatusSchema = z.enum([
  'open',
  'acknowledged',
  'investigating',
  'resolved',
  'closed',
]);

export const incidentEscalationStateSchema = z.enum([
  'none',
  'scheduled',
  'escalated',
  'critical',
]);

export const incidentEvidenceReferenceSchema = z.object({
  kind: z.enum(['snapshot', 'clip', 'recording']),
  snapshot_id: snapshotIdSchema.nullable().optional(),
  clip_id: clipIdSchema.nullable().optional(),
  recording_id: recordingIdSchema.nullable().optional(),
  path: z.string().min(1),
  preview_url: z.string().optional(),
  playback_url: z.string().optional(),
});

export const incidentSchema = z.object({
  id: incidentIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  severity: z.string(),
  confidence: z.number().min(0).max(1),
  category: z.string(),
  summary: z.string(),
  status: incidentStatusSchema,
  camera_ids: z.array(cameraIdSchema),
  timeline_start: isoTimestampSchema,
  timeline_end: isoTimestampSchema,
  policy_hits: z.record(z.unknown()),
  escalation_state: incidentEscalationStateSchema,
  linked_event_ids: z.array(eventIdSchema).default([]),
  evidence_references: z.array(incidentEvidenceReferenceSchema).default([]),
  dedupe_count: z.number().int().nonnegative().default(1),
  acknowledged_by: z.string().uuid().nullable(),
  acknowledged_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Incident = z.infer<typeof incidentSchema>;
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export type IncidentEscalationState = z.infer<typeof incidentEscalationStateSchema>;
export type IncidentEvidenceReference = z.infer<typeof incidentEvidenceReferenceSchema>;
