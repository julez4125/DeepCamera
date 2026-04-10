import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { siteIdSchema, tenantIdSchema } from '../common/id';

export const siteSchema = z.object({
  id: siteIdSchema,
  tenant_id: tenantIdSchema,
  name: z.string().min(1),
  address: z.string().min(1),
  timezone: z.string(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Site = z.infer<typeof siteSchema>;
