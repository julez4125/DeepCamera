import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  eventIdSchema,
  tenantIdSchema,
  siteIdSchema,
  cameraIdSchema,
} from '../common/id';

export const eventTypeSchema = z.enum([
  'camera.online',
  'camera.offline',
  'stream.degraded',
  'frame.captured',
  'detection.created',
  'track.updated',
  'face.matched',
  'plate.read',
  'reid.linked',
  'vlm.summary_ready',
  'incident.created',
  'incident.updated',
  'alert.sent',
  'annotation.completed',
  'training.job_updated',
  'model.deployment_updated',
  'skill.failed',
  'worker.overloaded',
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export const eventEnvelopeSchema = z.object({
  event_id: eventIdSchema,
  event_type: eventTypeSchema,
  timestamp: isoTimestampSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  camera_id: cameraIdSchema,
  correlation_id: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
