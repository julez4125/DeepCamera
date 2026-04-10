import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  cameraIdSchema,
  siteIdSchema,
  storagePolicyAssignmentIdSchema,
  storageTargetIdSchema,
  tenantIdSchema,
} from '../common/id';

export const storagePolicyAssignmentSchema = z.object({
  id: storagePolicyAssignmentIdSchema,
  tenant_id: tenantIdSchema,
  storage_target_id: storageTargetIdSchema,
  site_id: siteIdSchema.nullable(),
  camera_id: cameraIdSchema.nullable(),
  path_prefix: z.string().nullable(),
  retention_days: z.number().int().nonnegative(),
  replication_enabled: z.boolean().default(true),
  priority: z.number().int().nonnegative().default(100),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type StoragePolicyAssignment = z.infer<typeof storagePolicyAssignmentSchema>;
