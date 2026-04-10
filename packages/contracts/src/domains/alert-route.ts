import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { alertRouteIdSchema, policyIdSchema } from '../common/id';

export const alertChannelSchema = z.enum([
  'webhook',
  'mqtt',
  'telegram',
  'discord',
  'slack',
  'email',
]);

export const alertRouteSchema = z.object({
  id: alertRouteIdSchema,
  policy_id: policyIdSchema,
  channel: alertChannelSchema,
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  created_at: isoTimestampSchema,
});

export type AlertRoute = z.infer<typeof alertRouteSchema>;
export type AlertChannel = z.infer<typeof alertChannelSchema>;
