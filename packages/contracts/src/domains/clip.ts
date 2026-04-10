import { z } from 'zod';
import { cameraIdSchema, clipIdSchema, recordingIdSchema } from '../common/id';
import { isoTimestampSchema } from '../common/timestamp';

export const clipSchema = z.object({
  id: clipIdSchema,
  camera_id: cameraIdSchema,
  recording_id: recordingIdSchema.nullable(),
  start_time: isoTimestampSchema,
  end_time: isoTimestampSchema,
  file_path: z.string().min(1),
  file_size: z.number().int().nonnegative().nullable(),
  thumbnail_path: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  created_at: isoTimestampSchema,
});

export type Clip = z.infer<typeof clipSchema>;
