import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { auditLogIdSchema, tenantIdSchema } from '../common/id';

export const auditLogSchema = z.object({
  id: auditLogIdSchema,
  tenant_id: tenantIdSchema,
  user_id: z.string().uuid(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().uuid(),
  details: z.record(z.unknown()),
  ip_address: z.string(),
  created_at: isoTimestampSchema,
});

export type AuditLog = z.infer<typeof auditLogSchema>;
