import { z } from 'zod';
import { randomUUID } from 'crypto';

// Branded UUID types using Zod
const uuidSchema = z.string().uuid();

export const tenantIdSchema = uuidSchema.brand('TenantId');
export type TenantId = z.infer<typeof tenantIdSchema>;

export const siteIdSchema = uuidSchema.brand('SiteId');
export type SiteId = z.infer<typeof siteIdSchema>;

export const zoneIdSchema = uuidSchema.brand('ZoneId');
export type ZoneId = z.infer<typeof zoneIdSchema>;

export const cameraIdSchema = uuidSchema.brand('CameraId');
export type CameraId = z.infer<typeof cameraIdSchema>;

export const streamIdSchema = uuidSchema.brand('StreamId');
export type StreamId = z.infer<typeof streamIdSchema>;

export const recordingIdSchema = uuidSchema.brand('RecordingId');
export type RecordingId = z.infer<typeof recordingIdSchema>;

export const clipIdSchema = uuidSchema.brand('ClipId');
export type ClipId = z.infer<typeof clipIdSchema>;

export const snapshotIdSchema = uuidSchema.brand('SnapshotId');
export type SnapshotId = z.infer<typeof snapshotIdSchema>;

export const detectionIdSchema = uuidSchema.brand('DetectionId');
export type DetectionId = z.infer<typeof detectionIdSchema>;

export const eventIdSchema = uuidSchema.brand('EventId');
export type EventId = z.infer<typeof eventIdSchema>;

export const incidentIdSchema = uuidSchema.brand('IncidentId');
export type IncidentId = z.infer<typeof incidentIdSchema>;

export const policyIdSchema = uuidSchema.brand('PolicyId');
export type PolicyId = z.infer<typeof policyIdSchema>;

export const alertRouteIdSchema = uuidSchema.brand('AlertRouteId');
export type AlertRouteId = z.infer<typeof alertRouteIdSchema>;

export const enrichmentJobIdSchema = uuidSchema.brand('EnrichmentJobId');
export type EnrichmentJobId = z.infer<typeof enrichmentJobIdSchema>;

export const searchDocumentIdSchema = uuidSchema.brand('SearchDocumentId');
export type SearchDocumentId = z.infer<typeof searchDocumentIdSchema>;

export const watchlistIdSchema = uuidSchema.brand('WatchlistId');
export type WatchlistId = z.infer<typeof watchlistIdSchema>;

export const identityProfileIdSchema = uuidSchema.brand('IdentityProfileId');
export type IdentityProfileId = z.infer<typeof identityProfileIdSchema>;

export const plateReadIdSchema = uuidSchema.brand('PlateReadId');
export type PlateReadId = z.infer<typeof plateReadIdSchema>;

export const faceMatchIdSchema = uuidSchema.brand('FaceMatchId');
export type FaceMatchId = z.infer<typeof faceMatchIdSchema>;

export const reIdTrackLinkIdSchema = uuidSchema.brand('ReIdTrackLinkId');
export type ReIdTrackLinkId = z.infer<typeof reIdTrackLinkIdSchema>;

export const annotationTaskIdSchema = uuidSchema.brand('AnnotationTaskId');
export type AnnotationTaskId = z.infer<typeof annotationTaskIdSchema>;

export const datasetVersionIdSchema = uuidSchema.brand('DatasetVersionId');
export type DatasetVersionId = z.infer<typeof datasetVersionIdSchema>;

export const trainingJobIdSchema = uuidSchema.brand('TrainingJobId');
export type TrainingJobId = z.infer<typeof trainingJobIdSchema>;

export const modelDeploymentIdSchema = uuidSchema.brand('ModelDeploymentId');
export type ModelDeploymentId = z.infer<typeof modelDeploymentIdSchema>;

export const storageTargetIdSchema = uuidSchema.brand('StorageTargetId');
export type StorageTargetId = z.infer<typeof storageTargetIdSchema>;

export const storagePolicyAssignmentIdSchema = uuidSchema.brand('StoragePolicyAssignmentId');
export type StoragePolicyAssignmentId = z.infer<typeof storagePolicyAssignmentIdSchema>;

export const storageObjectCopyIdSchema = uuidSchema.brand('StorageObjectCopyId');
export type StorageObjectCopyId = z.infer<typeof storageObjectCopyIdSchema>;

export const storageReplicationJobIdSchema = uuidSchema.brand('StorageReplicationJobId');
export type StorageReplicationJobId = z.infer<typeof storageReplicationJobIdSchema>;

export const modelIdSchema = uuidSchema.brand('ModelId');
export type ModelId = z.infer<typeof modelIdSchema>;

export const skillIdSchema = uuidSchema.brand('SkillId');
export type SkillId = z.infer<typeof skillIdSchema>;

export const auditLogIdSchema = uuidSchema.brand('AuditLogId');
export type AuditLogId = z.infer<typeof auditLogIdSchema>;

/**
 * Create a new branded UUID
 */
export function createId(): string {
  return randomUUID();
}
