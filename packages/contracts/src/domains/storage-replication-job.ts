import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  storageReplicationJobIdSchema,
  storageTargetIdSchema,
  tenantIdSchema,
} from '../common/id';

export const storageReplicationJobStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
]);

export const storageReplicationJobSchema = z.object({
  id: storageReplicationJobIdSchema,
  tenant_id: tenantIdSchema,
  storage_target_id: storageTargetIdSchema,
  source_path: z.string().min(1),
  destination_path: z.string().min(1),
  status: storageReplicationJobStatusSchema,
  attempts: z.number().int().nonnegative().default(0),
  bytes_total: z.number().int().nonnegative().default(0),
  bytes_transferred: z.number().int().nonnegative().default(0),
  last_error: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type StorageReplicationJob = z.infer<typeof storageReplicationJobSchema>;
export type StorageReplicationJobStatus = z.infer<typeof storageReplicationJobStatusSchema>;
