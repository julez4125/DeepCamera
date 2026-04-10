import { z } from 'zod';
import { cameraIdSchema, clipIdSchema, recordingIdSchema, snapshotIdSchema } from '../common/id';
import { isoTimestampSchema } from '../common/timestamp';

export const snapshotSourceSchema = z.enum(['camera', 'stream', 'recording', 'clip', 'detection']);

export const snapshotSchema = z.object({
  id: snapshotIdSchema,
  camera_id: cameraIdSchema,
  recording_id: recordingIdSchema.nullable(),
  clip_id: clipIdSchema.nullable(),
  storage_path: z.string().min(1),
  mime_type: z.string().default('image/jpeg'),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  checksum: z.string().nullable(),
  captured_at: isoTimestampSchema,
  source: snapshotSourceSchema.default('camera'),
  metadata: z.record(z.unknown()).default({}),
  created_at: isoTimestampSchema,
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotSource = z.infer<typeof snapshotSourceSchema>;
