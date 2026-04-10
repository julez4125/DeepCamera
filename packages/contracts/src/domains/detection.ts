import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  cameraIdSchema,
  clipIdSchema,
  detectionIdSchema,
  recordingIdSchema,
  siteIdSchema,
  snapshotIdSchema,
  tenantIdSchema,
  zoneIdSchema,
} from '../common/id';

export const detectionLabelSchema = z.enum([
  'person',
  'vehicle',
  'animal',
  'bag',
  'unknown',
]);

export const detectionBoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const detectionSourceSchema = z.enum(['snapshot', 'clip', 'recording', 'frame']);

export const detectionSchema = z.object({
  id: detectionIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  camera_id: cameraIdSchema,
  snapshot_id: snapshotIdSchema.nullable().optional(),
  clip_id: clipIdSchema.nullable().optional(),
  recording_id: recordingIdSchema.nullable().optional(),
  label: detectionLabelSchema.or(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  bounding_box: detectionBoundingBoxSchema,
  zone_ids: z.array(zoneIdSchema).default([]),
  source: detectionSourceSchema,
  model: z.string().min(1),
  track_id: z.string().min(1).nullable().optional(),
  latency_ms: z.number().nonnegative(),
  frame_timestamp: isoTimestampSchema,
  created_at: isoTimestampSchema,
});

export type Detection = z.infer<typeof detectionSchema>;
export type DetectionBoundingBox = z.infer<typeof detectionBoundingBoxSchema>;
export type DetectionLabel = z.infer<typeof detectionLabelSchema>;
export type DetectionSource = z.infer<typeof detectionSourceSchema>;
