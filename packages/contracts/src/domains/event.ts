import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { eventIdSchema, cameraIdSchema, siteIdSchema, tenantIdSchema } from '../common/id';

export const severitySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);

export const eventSchema = z.object({
  id: eventIdSchema,
  camera_id: cameraIdSchema,
  site_id: siteIdSchema,
  tenant_id: tenantIdSchema,
  event_type: z.string(),
  timestamp: isoTimestampSchema,
  payload: z.record(z.unknown()),
  severity: severitySchema,
  correlation_id: z.string().uuid(),
  created_at: isoTimestampSchema,
});

export type Event = z.infer<typeof eventSchema>;
export type Severity = z.infer<typeof severitySchema>;
