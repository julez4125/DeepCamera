import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { policyIdSchema, tenantIdSchema, siteIdSchema } from '../common/id';

export const policyArmedStateSchema = z.enum(['armed', 'disarmed', 'partial']);

export const policySchema = z.object({
  id: policyIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema.nullable(),
  name: z.string().min(1),
  conditions: z.record(z.unknown()),
  schedule: z.record(z.unknown()),
  severity_rules: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  armed_state: policyArmedStateSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Policy = z.infer<typeof policySchema>;
export type PolicyArmedState = z.infer<typeof policyArmedStateSchema>;
