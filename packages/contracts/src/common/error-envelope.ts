import { z } from 'zod';

export const standardErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  correlationId: z.string().uuid(),
  retriable: z.boolean().default(false),
});

export type StandardError = z.infer<typeof standardErrorSchema>;
