import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { tenantIdSchema } from '../common/id';

export const tenantSchema = z.object({
  id: tenantIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Tenant = z.infer<typeof tenantSchema>;
