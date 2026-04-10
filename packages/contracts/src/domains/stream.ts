import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { cameraIdSchema, streamIdSchema } from '../common/id';

export const streamTypeSchema = z.enum(['main', 'sub', 'snapshot']);

export const streamSchema = z.object({
  id: streamIdSchema,
  camera_id: cameraIdSchema,
  stream_type: streamTypeSchema,
  url: z.string().min(1),
  active: z.boolean().default(false),
  created_at: isoTimestampSchema,
});

export type Stream = z.infer<typeof streamSchema>;
export type StreamType = z.infer<typeof streamTypeSchema>;
