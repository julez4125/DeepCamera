import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { storageTargetIdSchema, tenantIdSchema } from '../common/id';

export const storageTargetTypeSchema = z.enum(['s3', 'smb', 'nfs', 'local']);

export const storageTargetStatusSchema = z.enum([
  'unknown',
  'healthy',
  'degraded',
  'unreachable',
]);

export const storageTargetSchema = z.object({
  id: storageTargetIdSchema,
  tenant_id: tenantIdSchema,
  name: z.string().min(1),
  target_type: storageTargetTypeSchema,
  status: storageTargetStatusSchema,
  config: z.record(z.unknown()),
  capabilities: z.record(z.unknown()).default({}),
  last_checked_at: isoTimestampSchema.nullable(),
  last_error: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type StorageTarget = z.infer<typeof storageTargetSchema>;
export type StorageTargetType = z.infer<typeof storageTargetTypeSchema>;
export type StorageTargetStatus = z.infer<typeof storageTargetStatusSchema>;
