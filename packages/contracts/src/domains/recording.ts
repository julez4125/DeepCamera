import { z } from 'zod';
import { cameraIdSchema, recordingIdSchema } from '../common/id';
import { isoTimestampSchema } from '../common/timestamp';

export const recordingModeSchema = z.enum(['continuous', 'motion', 'event', 'manual']);

export const recordingSchema = z.object({
  id: recordingIdSchema,
  camera_id: cameraIdSchema,
  start_time: isoTimestampSchema,
  end_time: isoTimestampSchema.nullable(),
  file_path: z.string().nullable(),
  file_size: z.number().int().nonnegative().nullable(),
  recording_mode: recordingModeSchema,
  created_at: isoTimestampSchema,
});

export type Recording = z.infer<typeof recordingSchema>;
export type RecordingMode = z.infer<typeof recordingModeSchema>;
