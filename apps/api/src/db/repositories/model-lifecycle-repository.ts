import type {
  AnnotationTask,
  DatasetVersion,
  ModelDeployment,
  ModelRegistryEntry,
  TrainingJob,
} from '@ainvr/contracts';
import type { PaginatedResult, PaginationOptions } from './base-repository.js';

export type AnnotationTaskRecord = AnnotationTask;
export type DatasetVersionRecord = DatasetVersion;
export type TrainingJobRecord = TrainingJob;
export type ModelRegistryEntryRecord = ModelRegistryEntry;
export type ModelDeploymentRecord = ModelDeployment;

export interface ModelLifecycleRepository {
  listAnnotationTasks(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      incident_id?: string;
      camera_id?: string;
      status?: AnnotationTaskRecord['status'];
    }
  ): Promise<PaginatedResult<AnnotationTaskRecord>>;
  listDatasetVersions(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      status?: DatasetVersionRecord['status'];
    }
  ): Promise<PaginatedResult<DatasetVersionRecord>>;
  listTrainingJobs(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      status?: TrainingJobRecord['status'];
    }
  ): Promise<PaginatedResult<TrainingJobRecord>>;
  listModels(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      family?: string;
      stage?: ModelRegistryEntryRecord['stage'];
    }
  ): Promise<PaginatedResult<ModelRegistryEntryRecord>>;
  listDeployments(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      status?: ModelDeploymentRecord['status'];
      target_scope?: ModelDeploymentRecord['target_scope'];
    }
  ): Promise<PaginatedResult<ModelDeploymentRecord>>;
  createAnnotationTask(data: Partial<AnnotationTaskRecord>): Promise<AnnotationTaskRecord>;
  createDatasetVersion(data: Partial<DatasetVersionRecord>): Promise<DatasetVersionRecord>;
  createTrainingJob(data: Partial<TrainingJobRecord>): Promise<TrainingJobRecord>;
  createModel(data: Partial<ModelRegistryEntryRecord>): Promise<ModelRegistryEntryRecord>;
  createDeployment(data: Partial<ModelDeploymentRecord>): Promise<ModelDeploymentRecord>;
  updateTrainingJob(id: string, data: Partial<TrainingJobRecord>): Promise<TrainingJobRecord | null>;
  updateModel(id: string, data: Partial<ModelRegistryEntryRecord>): Promise<ModelRegistryEntryRecord | null>;
  updateDeployment(id: string, data: Partial<ModelDeploymentRecord>): Promise<ModelDeploymentRecord | null>;
}
