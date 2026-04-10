import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  cameraIdSchema,
  eventIdSchema,
  faceMatchIdSchema,
  identityProfileIdSchema,
  incidentIdSchema,
  plateReadIdSchema,
  reIdTrackLinkIdSchema,
  siteIdSchema,
  tenantIdSchema,
  watchlistIdSchema,
} from '../common/id';

export const watchlistKindSchema = z.enum(['plate', 'face']);
export const watchlistDispositionSchema = z.enum(['allow', 'deny', 'interest']);

export const watchlistSchema = z.object({
  id: watchlistIdSchema,
  tenant_id: tenantIdSchema,
  kind: watchlistKindSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  disposition: watchlistDispositionSchema,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  enabled: z.boolean(),
  entries: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string()).default([]),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const identityProfileTypeSchema = z.enum(['person', 'vehicle']);
export const enrollmentStatusSchema = z.enum(['opt_in', 'pending_review', 'active', 'revoked']);

export const identityProfileSchema = z.object({
  id: identityProfileIdSchema,
  tenant_id: tenantIdSchema,
  type: identityProfileTypeSchema,
  display_name: z.string().min(1),
  reference_key: z.string().min(1),
  enrollment_status: enrollmentStatusSchema,
  watchlist_ids: z.array(watchlistIdSchema).default([]),
  notes: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const plateDirectionSchema = z.enum(['entering', 'exiting', 'unknown']);

export const plateReadSchema = z.object({
  id: plateReadIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  camera_id: cameraIdSchema,
  event_id: eventIdSchema.nullable(),
  incident_id: incidentIdSchema.nullable(),
  watchlist_id: watchlistIdSchema.nullable(),
  plate_text: z.string().min(2),
  plate_region: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  direction: plateDirectionSchema,
  vehicle_type: z.string().nullable(),
  occurred_at: isoTimestampSchema,
  created_at: isoTimestampSchema,
  metadata: z.record(z.unknown()).default({}),
});

export const faceMatchStatusSchema = z.enum([
  'match',
  'possible_match',
  'enrollment_required',
  'opt_in_required',
]);

export const faceMatchSchema = z.object({
  id: faceMatchIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  camera_id: cameraIdSchema,
  event_id: eventIdSchema.nullable(),
  incident_id: incidentIdSchema.nullable(),
  identity_profile_id: identityProfileIdSchema.nullable(),
  watchlist_id: watchlistIdSchema.nullable(),
  subject_label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: faceMatchStatusSchema,
  occurred_at: isoTimestampSchema,
  created_at: isoTimestampSchema,
  metadata: z.record(z.unknown()).default({}),
});

export const reIdLinkStatusSchema = z.enum(['linked', 'candidate', 'rejected']);

export const reIdTrackLinkSchema = z.object({
  id: reIdTrackLinkIdSchema,
  tenant_id: tenantIdSchema,
  incident_id: incidentIdSchema.nullable(),
  origin_camera_id: cameraIdSchema,
  target_camera_id: cameraIdSchema,
  origin_event_id: eventIdSchema.nullable(),
  target_event_id: eventIdSchema.nullable(),
  source_track_id: z.string().min(1),
  target_track_id: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: reIdLinkStatusSchema,
  movement_hint: z.string().min(1),
  travel_time_seconds: z.number().nonnegative(),
  occurred_at: isoTimestampSchema,
  created_at: isoTimestampSchema,
  metadata: z.record(z.unknown()).default({}),
});

export type Watchlist = z.infer<typeof watchlistSchema>;
export type WatchlistKind = z.infer<typeof watchlistKindSchema>;
export type WatchlistDisposition = z.infer<typeof watchlistDispositionSchema>;
export type IdentityProfile = z.infer<typeof identityProfileSchema>;
export type IdentityProfileType = z.infer<typeof identityProfileTypeSchema>;
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;
export type PlateRead = z.infer<typeof plateReadSchema>;
export type PlateDirection = z.infer<typeof plateDirectionSchema>;
export type FaceMatch = z.infer<typeof faceMatchSchema>;
export type FaceMatchStatus = z.infer<typeof faceMatchStatusSchema>;
export type ReIdTrackLink = z.infer<typeof reIdTrackLinkSchema>;
export type ReIdLinkStatus = z.infer<typeof reIdLinkStatusSchema>;
