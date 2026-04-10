import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { cameraIdSchema, siteIdSchema } from '../common/id';

export const protocolSchema = z.enum(['rtsp', 'onvif', 'http', 'hls']);

export const cameraStatusSchema = z.enum(['online', 'offline', 'degraded', 'unknown']);

export const cameraSchema = z.object({
  id: cameraIdSchema,
  site_id: siteIdSchema,
  name: z.string().min(1),
  stream_url: z.string().url(),
  protocol: protocolSchema,
  status: cameraStatusSchema,
  detection_enabled: z.boolean().default(true),
  recording_enabled: z.boolean().default(true),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Camera = z.infer<typeof cameraSchema>;
export type Protocol = z.infer<typeof protocolSchema>;
export type CameraStatus = z.infer<typeof cameraStatusSchema>;
