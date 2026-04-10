import { randomUUID } from 'node:crypto';
import type {
  AnnotationTaskRecord,
  ClipRepository,
  EventRepository,
  IncidentRepository,
  ModelDeploymentRecord,
  ModelLifecycleRepository,
  ModelRegistryEntryRecord,
  TrainingJobRecord,
} from '../db/repositories/index.js';

type RunModelLifecycleContext = {
  tenantId: string;
  incidentRepository: IncidentRepository;
  eventRepository: EventRepository;
  clipRepository: ClipRepository;
  lifecycleRepository: ModelLifecycleRepository;
};

type RunModelLifecycleResult = {
  annotations: Awaited<ReturnType<ModelLifecycleRepository['listAnnotationTasks']>>['data'];
  datasets: Awaited<ReturnType<ModelLifecycleRepository['listDatasetVersions']>>['data'];
  training_jobs: Awaited<ReturnType<ModelLifecycleRepository['listTrainingJobs']>>['data'];
  models: Awaited<ReturnType<ModelLifecycleRepository['listModels']>>['data'];
  deployments: Awaited<ReturnType<ModelLifecycleRepository['listDeployments']>>['data'];
  created: {
    annotations: number;
    datasets: number;
    training_jobs: number;
    models: number;
    deployments: number;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function runModelLifecyclePipeline(
  context: RunModelLifecycleContext
): Promise<RunModelLifecycleResult> {
  const [incidentsPage, eventsPage, annotationsPage, datasetsPage, trainingJobsPage, modelsPage, deploymentsPage] =
    await Promise.all([
      context.incidentRepository.findAll({ tenant_id: context.tenantId }, { limit: 100, offset: 0 }),
      context.eventRepository.findByTenantId(context.tenantId, { limit: 100, offset: 0 }),
      context.lifecycleRepository.listAnnotationTasks(context.tenantId, { limit: 200, offset: 0 }),
      context.lifecycleRepository.listDatasetVersions(context.tenantId, { limit: 50, offset: 0 }),
      context.lifecycleRepository.listTrainingJobs(context.tenantId, { limit: 50, offset: 0 }),
      context.lifecycleRepository.listModels(context.tenantId, { limit: 50, offset: 0 }),
      context.lifecycleRepository.listDeployments(context.tenantId, { limit: 50, offset: 0 }),
    ]);

  let createdAnnotations = 0;
  let createdDatasets = 0;
  let createdTrainingJobs = 0;
  let createdModels = 0;
  let createdDeployments = 0;

  for (const incident of incidentsPage.data) {
    const existingAnnotation = annotationsPage.data.find(
      (annotation) => annotation.incident_id === incident.id
    );

    if (existingAnnotation) {
      continue;
    }

    const clipId =
      incident.evidence_references.find((reference) => reference.clip_id)?.clip_id ?? null;
    const clip = clipId ? await context.clipRepository.findById(clipId) : null;
    const relatedEventCount = eventsPage.data.filter((event) =>
      incident.linked_event_ids.includes(event.id)
    ).length;

    annotationsPage.data.push(
      await context.lifecycleRepository.createAnnotationTask({
        id: randomUUID() as AnnotationTaskRecord['id'],
        tenant_id: context.tenantId as AnnotationTaskRecord['tenant_id'],
        site_id: incident.site_id as AnnotationTaskRecord['site_id'],
        camera_id: incident.camera_ids[0]! as AnnotationTaskRecord['camera_id'],
        incident_id: incident.id as AnnotationTaskRecord['incident_id'],
        clip_id: (clip?.id ?? null) as AnnotationTaskRecord['clip_id'],
        snapshot_id: null,
        recording_id: (clip?.recording_id ?? null) as AnnotationTaskRecord['recording_id'],
        source_type: incident.evidence_references.some((reference) => reference.clip_id)
          ? 'clip'
          : 'incident',
        label_schema: ['person', 'vehicle', 'bag'],
        status: 'review',
        priority: incident.severity === 'critical' ? 'critical' : 'high',
        assigned_to: 'ops-review@example.com',
        notes: `Review ${incident.category} evidence across ${relatedEventCount} linked events and confirm detection quality.`,
        created_at: incident.created_at,
        updated_at: incident.updated_at,
      })
    );
    createdAnnotations += 1;
  }

  if (!datasetsPage.data.length && annotationsPage.data.length) {
    const readyAnnotations = annotationsPage.data.filter((annotation) =>
      ['review', 'completed', 'exported'].includes(annotation.status)
    );

    if (readyAnnotations.length) {
      const classDistribution = readyAnnotations.reduce<Record<string, number>>((accumulator, annotation) => {
        for (const label of annotation.label_schema) {
          accumulator[label] = (accumulator[label] ?? 0) + 1;
        }
        return accumulator;
      }, {});

      datasetsPage.data.push(
        await context.lifecycleRepository.createDatasetVersion({
          id: randomUUID() as any,
          tenant_id: context.tenantId as any,
          name: 'Wave D Annotation Pack',
          version: '2026.04-r1',
          annotation_task_ids: readyAnnotations.map((annotation) => annotation.id),
          label_count: readyAnnotations.length * 3,
          class_distribution: classDistribution,
          status: 'ready',
          storage_uri: 's3://ainvr-datasets/wave-d/2026.04-r1',
          created_at: nowIso(),
          updated_at: nowIso(),
        })
      );
      createdDatasets += 1;
    }
  }

  const latestDataset = datasetsPage.data[0] ?? null;

  if (latestDataset && !trainingJobsPage.data.length) {
    const startedAt = nowIso();
    const completedAt = nowIso();
    const trainingJob = await context.lifecycleRepository.createTrainingJob({
      id: randomUUID() as TrainingJobRecord['id'],
      tenant_id: context.tenantId as TrainingJobRecord['tenant_id'],
      dataset_version_id: latestDataset.id as TrainingJobRecord['dataset_version_id'],
      model_family: 'detector-yolo',
      status: 'completed',
      metrics: {
        mAP50: 0.84,
        recall: 0.8,
        precision: 0.87,
      },
      output_model_id: null,
      started_at: startedAt,
      completed_at: completedAt,
      created_at: startedAt,
      updated_at: completedAt,
    });
    trainingJobsPage.data.push(trainingJob);
    createdTrainingJobs += 1;
  }

  const latestTrainingJob = trainingJobsPage.data[0] ?? null;

  let rolloutModel = modelsPage.data[0] ?? null;

  if (latestTrainingJob && !modelsPage.data.some((model) => model.source_training_job_id === latestTrainingJob.id)) {
    const model = await context.lifecycleRepository.createModel({
      id: randomUUID() as ModelRegistryEntryRecord['id'],
      tenant_id: context.tenantId as ModelRegistryEntryRecord['tenant_id'],
      name: 'Ops Detector',
      family: latestTrainingJob.model_family,
      version: '2026.04-r1',
      format: 'onnx',
      source_training_job_id: latestTrainingJob.id as ModelRegistryEntryRecord['source_training_job_id'],
      stage: 'staging',
      metrics: latestTrainingJob.metrics,
      metadata: {
        promoted_from_dataset: latestDataset?.id ?? null,
        source: 'phase-10-pipeline',
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    modelsPage.data.push(model);
    rolloutModel = model;
    createdModels += 1;

    if (latestTrainingJob.output_model_id !== model.id) {
      await context.lifecycleRepository.updateTrainingJob(latestTrainingJob.id, {
        output_model_id: model.id,
        updated_at: nowIso(),
      });
      latestTrainingJob.output_model_id = model.id;
    }
  }

  if (rolloutModel && !deploymentsPage.data.some((deployment) => deployment.model_id === rolloutModel.id)) {
    deploymentsPage.data.push(
      await context.lifecycleRepository.createDeployment({
        id: randomUUID() as ModelDeploymentRecord['id'],
        tenant_id: context.tenantId as ModelDeploymentRecord['tenant_id'],
        model_id: rolloutModel.id as ModelDeploymentRecord['model_id'],
        worker_type: rolloutModel.family,
        status: 'canary',
        rollout_strategy: 'canary',
        target_scope: 'site',
        target_id: incidentsPage.data[0]?.site_id ?? null,
        config: {
          sample_ratio: 0.2,
          auto_rollback_threshold: 0.1,
        },
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    );
    createdDeployments += 1;
  }

  return {
    annotations: annotationsPage.data.sort((left, right) => right.created_at.localeCompare(left.created_at)),
    datasets: datasetsPage.data.sort((left, right) => right.created_at.localeCompare(left.created_at)),
    training_jobs: trainingJobsPage.data.sort((left, right) => right.created_at.localeCompare(left.created_at)),
    models: modelsPage.data.sort((left, right) => right.created_at.localeCompare(left.created_at)),
    deployments: deploymentsPage.data.sort((left, right) => right.created_at.localeCompare(left.created_at)),
    created: {
      annotations: createdAnnotations,
      datasets: createdDatasets,
      training_jobs: createdTrainingJobs,
      models: createdModels,
      deployments: createdDeployments,
    },
  };
}
