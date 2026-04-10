import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  clipIdSchema,
  enrichmentJobIdSchema,
  eventIdSchema,
  incidentIdSchema,
  recordingIdSchema,
  snapshotIdSchema,
  tenantIdSchema,
} from '../common/id';

export const enrichmentSourceTypeSchema = z.enum(['incident', 'event']);
export const enrichmentStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);
export const enrichmentModelSchema = z.enum(['vlm-fallback-v1']);

export const enrichmentSchema = z.object({
  id: enrichmentJobIdSchema,
  tenant_id: tenantIdSchema,
  source_type: enrichmentSourceTypeSchema,
  source_id: z.string().uuid(),
  incident_id: incidentIdSchema.nullable(),
  event_id: eventIdSchema.nullable(),
  clip_id: clipIdSchema.nullable(),
  snapshot_id: snapshotIdSchema.nullable(),
  recording_id: recordingIdSchema.nullable(),
  status: enrichmentStatusSchema,
  model: enrichmentModelSchema,
  summary: z.string().nullable(),
  suspicious_context: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  semantic_terms: z.array(z.string()).default([]),
  queued_at: isoTimestampSchema,
  started_at: isoTimestampSchema.nullable(),
  completed_at: isoTimestampSchema.nullable(),
  error_message: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Enrichment = z.infer<typeof enrichmentSchema>;
export type EnrichmentSourceType = z.infer<typeof enrichmentSourceTypeSchema>;
export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;
export type EnrichmentModel = z.infer<typeof enrichmentModelSchema>;
