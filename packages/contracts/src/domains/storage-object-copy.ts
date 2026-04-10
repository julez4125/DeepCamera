import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  clipIdSchema,
  recordingIdSchema,
  storageObjectCopyIdSchema,
  storageTargetIdSchema,
  tenantIdSchema,
} from '../common/id';

export const storageObjectCopyStatusSchema = z.enum([
  'local_only',
  'replicating',
  'replicated',
  'degraded',
  'failed',
]);

export const storageObjectCopySchema = z.object({
  id: storageObjectCopyIdSchema,
  tenant_id: tenantIdSchema,
  clip_id: clipIdSchema.nullable(),
  recording_id: recordingIdSchema.nullable(),
  storage_target_id: storageTargetIdSchema,
  object_path: z.string().min(1),
  copy_status: storageObjectCopyStatusSchema,
  checksum: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
  verified_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type StorageObjectCopy = z.infer<typeof storageObjectCopySchema>;
export type StorageObjectCopyStatus = z.infer<typeof storageObjectCopyStatusSchema>;
