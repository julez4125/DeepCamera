import { z } from 'zod';

/**
 * ISO 8601 timestamp string
 */
export const isoTimestampSchema = z.string().datetime();

export type ISOTimestamp = z.infer<typeof isoTimestampSchema>;
