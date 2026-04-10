import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { zoneIdSchema, siteIdSchema } from '../common/id';

export const zoneTypeSchema = z.enum(['entry', 'restricted', 'restricted_zone']);

export const zoneSchema = z.object({
  id: zoneIdSchema,
  site_id: siteIdSchema,
  name: z.string().min(1),
  polygon: z.record(z.unknown()),
  zone_type: zoneTypeSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Zone = z.infer<typeof zoneSchema>;
export type ZoneType = z.infer<typeof zoneTypeSchema>;
