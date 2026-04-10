import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  cameraIdSchema,
  clipIdSchema,
  eventIdSchema,
  incidentIdSchema,
  searchDocumentIdSchema,
  siteIdSchema,
  tenantIdSchema,
} from '../common/id';

export const semanticSearchSourceTypeSchema = z.enum(['incident', 'event', 'clip']);

export const semanticSearchResultSchema = z.object({
  id: searchDocumentIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  source_type: semanticSearchSourceTypeSchema,
  source_id: z.string().uuid(),
  incident_id: incidentIdSchema.nullable(),
  event_id: eventIdSchema.nullable(),
  clip_id: clipIdSchema.nullable(),
  camera_ids: z.array(cameraIdSchema),
  severity: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  occurred_at: isoTimestampSchema,
  keywords: z.array(z.string()).default([]),
  semantic_terms: z.array(z.string()).default([]),
  matched_terms: z.array(z.string()).default([]),
  score: z.number().nonnegative().default(0),
  vlm_summary: z.string().nullable(),
  suspicious_context: z.array(z.string()).default([]),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type SemanticSearchResult = z.infer<typeof semanticSearchResultSchema>;
export type SemanticSearchSourceType = z.infer<typeof semanticSearchSourceTypeSchema>;
