import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import {
  annotationTaskIdSchema,
  cameraIdSchema,
  clipIdSchema,
  datasetVersionIdSchema,
  incidentIdSchema,
  modelDeploymentIdSchema,
  modelIdSchema,
  recordingIdSchema,
  siteIdSchema,
  snapshotIdSchema,
  tenantIdSchema,
  trainingJobIdSchema,
} from '../common/id';

export const annotationStatusSchema = z.enum([
  'queued',
  'labeling',
  'review',
  'completed',
  'exported',
]);

export const annotationSourceSchema = z.enum(['incident', 'clip', 'snapshot']);

export const annotationTaskSchema = z.object({
  id: annotationTaskIdSchema,
  tenant_id: tenantIdSchema,
  site_id: siteIdSchema,
  camera_id: cameraIdSchema,
  incident_id: incidentIdSchema.nullable(),
  clip_id: clipIdSchema.nullable(),
  snapshot_id: snapshotIdSchema.nullable(),
  recording_id: recordingIdSchema.nullable(),
  source_type: annotationSourceSchema,
  label_schema: z.array(z.string()).default([]),
  status: annotationStatusSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  assigned_to: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const datasetStatusSchema = z.enum(['draft', 'ready', 'published']);

export const datasetVersionSchema = z.object({
  id: datasetVersionIdSchema,
  tenant_id: tenantIdSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  annotation_task_ids: z.array(annotationTaskIdSchema).default([]),
  label_count: z.number().nonnegative(),
  class_distribution: z.record(z.number().nonnegative()).default({}),
  status: datasetStatusSchema,
  storage_uri: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const trainingJobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const trainingJobSchema = z.object({
  id: trainingJobIdSchema,
  tenant_id: tenantIdSchema,
  dataset_version_id: datasetVersionIdSchema,
  model_family: z.string().min(1),
  status: trainingJobStatusSchema,
  metrics: z.record(z.number()).default({}),
  output_model_id: modelIdSchema.nullable(),
  started_at: isoTimestampSchema.nullable(),
  completed_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const modelStageSchema = z.enum(['candidate', 'staging', 'production', 'rollback']);

export const modelRegistryEntrySchema = z.object({
  id: modelIdSchema,
  tenant_id: tenantIdSchema,
  name: z.string().min(1),
  family: z.string().min(1),
  version: z.string().min(1),
  format: z.string().min(1),
  source_training_job_id: trainingJobIdSchema.nullable(),
  stage: modelStageSchema,
  metrics: z.record(z.number()).default({}),
  metadata: z.record(z.unknown()).default({}),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const deploymentStatusSchema = z.enum([
  'staged',
  'canary',
  'production',
  'rollback_ready',
]);

export const modelDeploymentSchema = z.object({
  id: modelDeploymentIdSchema,
  tenant_id: tenantIdSchema,
  model_id: modelIdSchema,
  worker_type: z.string().min(1),
  status: deploymentStatusSchema,
  rollout_strategy: z.enum(['manual', 'canary', 'rollback']),
  target_scope: z.enum(['global', 'site', 'camera']),
  target_id: z.string().uuid().nullable(),
  config: z.record(z.unknown()).default({}),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type AnnotationTask = z.infer<typeof annotationTaskSchema>;
export type AnnotationStatus = z.infer<typeof annotationStatusSchema>;
export type AnnotationSource = z.infer<typeof annotationSourceSchema>;
export type DatasetVersion = z.infer<typeof datasetVersionSchema>;
export type DatasetStatus = z.infer<typeof datasetStatusSchema>;
export type TrainingJob = z.infer<typeof trainingJobSchema>;
export type TrainingJobStatus = z.infer<typeof trainingJobStatusSchema>;
export type ModelRegistryEntry = z.infer<typeof modelRegistryEntrySchema>;
export type ModelStage = z.infer<typeof modelStageSchema>;
export type ModelDeployment = z.infer<typeof modelDeploymentSchema>;
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;
