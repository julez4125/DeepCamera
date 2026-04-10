type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type ApiIntelligenceOverview = {
  summary: {
    watchlists: number;
    identity_profiles: number;
    plate_reads: number;
    face_matches: number;
    reid_links: number;
  };
  watchlists: ApiWatchlist[];
  identity_profiles: ApiIdentityProfile[];
  plate_reads: ApiPlateRead[];
  face_matches: ApiFaceMatch[];
  reid_links: ApiReIdLink[];
};

type ApiMlOverview = {
  summary: {
    annotations: number;
    datasets: number;
    training_jobs: number;
    models: number;
    deployments: number;
  };
  annotations: ApiAnnotationTask[];
  datasets: ApiDatasetVersion[];
  training_jobs: ApiTrainingJob[];
  models: ApiModel[];
  deployments: ApiDeployment[];
};

type ApiWatchlist = {
  id: string;
  kind: 'plate' | 'face';
  name: string;
  description?: string | null;
  disposition?: 'allow' | 'deny' | 'interest' | null;
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  enabled?: boolean | null;
  entries?: string[] | null;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiIdentityProfile = {
  id: string;
  type?: 'person' | 'vehicle' | null;
  display_name: string;
  reference_key?: string | null;
  enrollment_status?: 'opt_in' | 'pending_review' | 'active' | 'revoked' | null;
  watchlist_ids?: string[] | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiPlateRead = {
  id: string;
  plate_text: string;
  confidence?: number | null;
  direction?: 'entering' | 'exiting' | 'unknown' | null;
  vehicle_type?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  camera_id?: string | null;
  site_id?: string | null;
  watchlist_id?: string | null;
  incident_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ApiFaceMatch = {
  id: string;
  subject_label: string;
  confidence?: number | null;
  status?: 'match' | 'possible_match' | 'enrollment_required' | 'opt_in_required' | null;
  occurred_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  camera_id?: string | null;
  site_id?: string | null;
  watchlist_id?: string | null;
  identity_profile_id?: string | null;
  incident_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ApiReIdLink = {
  id: string;
  source_track_id: string;
  target_track_id: string;
  confidence?: number | null;
  status?: 'linked' | 'candidate' | 'rejected' | null;
  movement_hint?: string | null;
  travel_time_seconds?: number | null;
  occurred_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  origin_camera_id?: string | null;
  target_camera_id?: string | null;
  incident_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ApiAnnotationTask = {
  id: string;
  source_type?: 'incident' | 'clip' | 'snapshot' | null;
  status?: 'queued' | 'labeling' | 'review' | 'completed' | 'exported' | null;
  priority?: 'low' | 'medium' | 'high' | 'critical' | null;
  assigned_to?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  incident_id?: string | null;
  clip_id?: string | null;
  snapshot_id?: string | null;
  recording_id?: string | null;
  camera_id?: string | null;
  site_id?: string | null;
  label_schema?: string[] | null;
};

type ApiDatasetVersion = {
  id: string;
  name: string;
  version: string;
  annotation_task_ids?: string[] | null;
  label_count?: number | null;
  class_distribution?: Record<string, number> | null;
  status?: 'draft' | 'ready' | 'published' | null;
  storage_uri?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiTrainingJob = {
  id: string;
  dataset_version_id?: string | null;
  model_family?: string | null;
  status?: 'queued' | 'running' | 'completed' | 'failed' | null;
  metrics?: Record<string, number> | null;
  output_model_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiModel = {
  id: string;
  name: string;
  family?: string | null;
  version?: string | null;
  format?: string | null;
  source_training_job_id?: string | null;
  stage?: 'candidate' | 'staging' | 'production' | 'rollback' | null;
  metrics?: Record<string, number> | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiDeployment = {
  id: string;
  model_id?: string | null;
  worker_type?: string | null;
  status?: 'staged' | 'canary' | 'production' | 'rollback_ready' | null;
  rollout_strategy?: 'manual' | 'canary' | 'rollback' | null;
  target_scope?: 'global' | 'site' | 'camera' | null;
  target_id?: string | null;
  config?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Phase9Source = 'api' | 'fallback';
export type Phase9FallbackPart = 'specialized_intelligence' | 'model_lifecycle';
export type Phase9IdentityModule = 'lpr' | 'face' | 'reid';
export type Phase9ModuleStatus = 'ready' | 'optional' | 'disabled' | 'degraded';
export type Phase9ReviewState = 'watching' | 'review' | 'cleared' | 'disabled';

export type Phase9ModuleCard = {
  id: Phase9IdentityModule;
  label: string;
  status: Phase9ModuleStatus;
  summary: string;
  detail: string;
  qualityScore: number;
  enabled: boolean;
  optInRequired: boolean;
  lastSignalAt: string;
  eventCount: number;
};

export type Phase9WatchlistEntry = {
  id: string;
  module: Phase9IdentityModule;
  label: string;
  signal: string;
  status: Phase9ReviewState;
  privacyMode: string;
  confidence: number;
  lastSeenAt: string;
  cameraName: string;
  evidenceLabel: string;
};

export type Phase9IdentityEvent = {
  id: string;
  module: Phase9IdentityModule;
  title: string;
  subtitle: string;
  confidence: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  reviewState: Phase9ReviewState;
  watchlistId: string | null;
  cameraName: string;
  evidenceHref: string | null;
  createdAt: string;
};

export type Phase9ReIdTrack = {
  id: string;
  label: string;
  cameras: string[];
  movementHint: string;
  continuity: number;
  status: 'linked' | 'candidate' | 'stale';
  updatedAt: string;
};

export type Phase10LifecycleStageId = 'annotation' | 'training' | 'deployment';
export type Phase10LifecycleStageStatus = 'queued' | 'running' | 'completed' | 'staged' | 'production' | 'rollback';

export type Phase10LifecycleStage = {
  id: Phase10LifecycleStageId;
  label: string;
  status: Phase10LifecycleStageStatus;
  summary: string;
  detail: string;
  count: number;
  latestAt: string;
};

export type Phase10ModelLifecycle = {
  source: Phase9Source;
  partialFallbacks: Phase9FallbackPart[];
  annotations: ApiAnnotationTask[];
  datasets: ApiDatasetVersion[];
  trainingJobs: ApiTrainingJob[];
  models: ApiModel[];
  deployments: ApiDeployment[];
  stages: Phase10LifecycleStage[];
  summary: {
    annotations: number;
    datasets: number;
    trainingJobs: number;
    models: number;
    deployments: number;
    activeTrainingJobs: number;
    productionDeployments: number;
  };
  integrationNote: string;
  updatedAt: string;
};

export type Phase9Workspace = {
  source: Phase9Source;
  partialFallbacks: Phase9FallbackPart[];
  modules: Phase9ModuleCard[];
  watchlists: Phase9WatchlistEntry[];
  events: Phase9IdentityEvent[];
  reidTracks: Phase9ReIdTrack[];
  modelLifecycle: Phase10ModelLifecycle;
  summary: {
    activeModules: number;
    watchedSubjects: number;
    reviewQueue: number;
    qualityScore: number;
    annotationTasks: number;
    trainingJobs: number;
    deployments: number;
  };
  integrationNote: string;
  updatedAt: string;
};

export type Phase9IncidentInput = {
  id: string;
  severity: string;
  category: string;
  summary: string;
  status: string;
  camera_ids: string[];
  timeline_start: string;
  timeline_end: string;
  confidence: number;
  created_at: string;
  updated_at: string;
};

export type Phase9TimelineInput = {
  id: string;
  type: 'clip' | 'recording';
  title: string;
  subtitle: string;
  playbackUrl: string;
  status: string;
  startTime: string;
  endTime: string;
};

export type Phase9LoadParams = {
  token: string;
  siteId: string;
  siteName: string;
  cameraId: string;
  cameraName: string;
  incidents: Phase9IncidentInput[];
  timelineItems: Phase9TimelineInput[];
  signal?: AbortSignal;
};

async function fetchJson<T>(path: string, token: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(path, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as ApiEnvelope<T>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeConfidence(value?: number | null): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return clamp(Math.round(value > 1 ? value : value * 100), 0, 100);
}

function latestTimestamp(values: Array<string | null | undefined>, fallback: string): string {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (!filtered.length) {
    return fallback;
  }

  filtered.sort();
  return filtered[filtered.length - 1] ?? fallback;
}

function moduleLabel(module: Phase9IdentityModule): string {
  switch (module) {
    case 'lpr':
      return 'LPR';
    case 'face':
      return 'Face recognition';
    case 'reid':
      return 'Re-ID';
  }
}

function moduleStatusFromCount(count: number, enabled: boolean): Phase9ModuleStatus {
  if (!enabled) {
    return 'disabled';
  }

  if (count === 0) {
    return 'optional';
  }

  return count > 2 ? 'ready' : 'degraded';
}

function summarizeLabelList(values: string[], emptyLabel: string): string {
  return values.length ? values.join(' · ') : emptyLabel;
}

function buildModuleSummary(
  id: Phase9IdentityModule,
  watchlistCount: number,
  signalCount: number,
  lastSignalAt: string,
  enabled = true
): Phase9ModuleCard {
  const qualityScore = clamp(
    id === 'reid' ? 72 + signalCount * 4 : 68 + watchlistCount * 4 + signalCount * 2,
    66,
    96
  );

  const label = moduleLabel(id);

  return {
    id,
    label,
    status: moduleStatusFromCount(signalCount + watchlistCount, enabled),
    summary:
      id === 'lpr'
        ? `${watchlistCount} plate watchlists and ${signalCount} plate reads stay reviewable in the same workspace.`
        : id === 'face'
          ? `${watchlistCount} face watchlists and ${signalCount} face matches remain opt-in by design.`
          : `${signalCount} cross-camera links and ${watchlistCount} linked subjects stay available for review.`,
    detail:
      id === 'lpr'
        ? 'Plate OCR, watchlists, and review state are kept explicit so the core incident path stays separated.'
        : id === 'face'
          ? 'Enrollment gates and consent-sensitive matching are surfaced before the operator can act.'
          : 'Re-ID candidates are surfaced as movement hints rather than identity assertions.',
    qualityScore,
    enabled,
    optInRequired: id === 'face',
    lastSignalAt,
    eventCount: signalCount,
  };
}

function buildFallbackWorkspace(params: Phase9LoadParams): Phase9Workspace {
  const now = new Date().toISOString();
  const referenceIncident = params.incidents[0] ?? null;
  const referenceTimeline = params.timelineItems[0] ?? null;

  const watchlists: Phase9WatchlistEntry[] = [
    {
      id: 'fallback-plate-watch',
      module: 'lpr',
      label: `${params.siteName} plate watchlist`,
      signal: 'ZH 48291 candidate plate',
      status: 'review',
      privacyMode: 'Plate only',
      confidence: 84,
      lastSeenAt: referenceTimeline?.endTime ?? now,
      cameraName: params.cameraName,
      evidenceLabel: referenceTimeline ? `${referenceTimeline.type} evidence` : 'Live camera signal',
    },
    {
      id: 'fallback-face-watch',
      module: 'face',
      label: 'Opt-in contractor profile',
      signal: 'Enrollment pending verification',
      status: 'watching',
      privacyMode: 'Opt-in profile',
      confidence: 76,
      lastSeenAt: referenceIncident?.updated_at ?? now,
      cameraName: params.cameraName,
      evidenceLabel: referenceIncident?.summary ?? 'Incident context pending',
    },
    {
      id: 'fallback-reid-watch',
      module: 'reid',
      label: 'Cross-camera track candidate',
      signal: 'Blue jacket movement hint',
      status: 'watching',
      privacyMode: 'Appearance embedding',
      confidence: 81,
      lastSeenAt: referenceIncident?.updated_at ?? now,
      cameraName: params.cameraName,
      evidenceLabel: referenceIncident?.category ?? 'Movement signal',
    },
  ];

  const events: Phase9IdentityEvent[] = [
    {
      id: 'fallback-lpr-event',
      module: 'lpr',
      title: 'Plate candidate queued for review',
      subtitle: 'OCR result needs operator confirmation before alert routing.',
      confidence: 84,
      risk: 'medium',
      reviewState: 'review',
      watchlistId: 'fallback-plate-watch',
      cameraName: params.cameraName,
      evidenceHref: referenceTimeline?.playbackUrl ?? null,
      createdAt: referenceTimeline?.endTime ?? now,
    },
    {
      id: 'fallback-face-event',
      module: 'face',
      title: 'Opt-in profile signal',
      subtitle: 'Enrollment-gated identity candidate remains review-only.',
      confidence: 76,
      risk: 'low',
      reviewState: 'watching',
      watchlistId: 'fallback-face-watch',
      cameraName: params.cameraName,
      evidenceHref: referenceTimeline?.playbackUrl ?? null,
      createdAt: referenceIncident?.updated_at ?? now,
    },
    {
      id: 'fallback-reid-event',
      module: 'reid',
      title: 'Cross-camera track linked',
      subtitle: 'Movement hint aligns with recent incident context.',
      confidence: 81,
      risk: referenceIncident?.severity === 'critical' ? 'critical' : 'medium',
      reviewState: 'watching',
      watchlistId: 'fallback-reid-watch',
      cameraName: params.cameraName,
      evidenceHref: referenceTimeline?.playbackUrl ?? null,
      createdAt: referenceIncident?.updated_at ?? now,
    },
  ];

  const reidTracks: Phase9ReIdTrack[] = [
    {
      id: 'fallback-track-primary',
      label: 'Track A12 movement candidate',
      cameras: [params.cameraName, `${params.siteName} adjacent view`],
      movementHint: 'Subject appears to move toward adjacent entry coverage.',
      continuity: 82,
      status: 'candidate',
      updatedAt: referenceIncident?.updated_at ?? now,
    },
  ];

  const annotations: ApiAnnotationTask[] = [
    {
      id: 'fallback-annotation-1',
      source_type: 'incident',
      status: 'review',
      priority: 'high',
      assigned_to: 'operator',
      notes: 'Review the incident-led identity signal.',
      created_at: referenceIncident?.created_at ?? now,
      updated_at: referenceIncident?.updated_at ?? now,
      incident_id: referenceIncident?.id ?? null,
      clip_id: null,
      snapshot_id: null,
      recording_id: referenceTimeline?.type === 'recording' ? referenceTimeline.id : null,
      camera_id: params.cameraId,
      site_id: params.siteId,
      label_schema: ['person', 'vehicle', 'identity'],
    },
  ];

  const datasets: ApiDatasetVersion[] = [
    {
      id: 'fallback-dataset-1',
      name: 'Wave D starter dataset',
      version: 'draft',
      annotation_task_ids: annotations.map((annotation) => annotation.id),
      label_count: 3,
      class_distribution: {
        person: 1,
        vehicle: 1,
        identity: 1,
      },
      status: 'draft',
      storage_uri: null,
      created_at: referenceIncident?.created_at ?? now,
      updated_at: now,
    },
  ];

  const trainingJobs: ApiTrainingJob[] = [
    {
      id: 'fallback-training-1',
      dataset_version_id: datasets[0]?.id ?? null,
      model_family: 'detector-yolo',
      status: 'running',
      metrics: {
        accuracy: 0.81,
        mAP50: 0.76,
      },
      output_model_id: null,
      started_at: referenceTimeline?.startTime ?? now,
      completed_at: null,
      created_at: referenceTimeline?.startTime ?? now,
      updated_at: now,
    },
  ];

  const models: ApiModel[] = [
    {
      id: 'fallback-model-1',
      name: 'Wave D detector baseline',
      family: 'detector-yolo',
      version: 'v0.1',
      format: 'onnx',
      source_training_job_id: trainingJobs[0]?.id ?? null,
      stage: 'candidate',
      metrics: {
        accuracy: 0.81,
        latency_ms: 42,
      },
      metadata: {
        source: 'fallback',
      },
      created_at: now,
      updated_at: now,
    },
  ];

  const deployments: ApiDeployment[] = [
    {
      id: 'fallback-deployment-1',
      model_id: models[0]?.id ?? null,
      worker_type: 'detector-yolo',
      status: 'canary',
      rollout_strategy: 'canary',
      target_scope: 'camera',
      target_id: params.cameraId,
      config: {
        cameras: [params.cameraName],
      },
      created_at: now,
      updated_at: now,
    },
  ];

  const stages: Phase10LifecycleStage[] = [
    {
      id: 'annotation',
      label: 'Annotation',
      status: 'running',
      summary: 'Incident-led labeling stays active.',
      detail: 'The workspace is ready for review, labeling, and export without leaving the camera context.',
      count: annotations.length,
      latestAt: latestTimestamp(annotations.map((annotation) => annotation.updated_at), now),
    },
    {
      id: 'training',
      label: 'Training',
      status: 'running',
      summary: 'One job is learning from the current dataset.',
      detail: 'Dataset creation and training remain coupled so the operator can see model progress immediately.',
      count: trainingJobs.length,
      latestAt: latestTimestamp(trainingJobs.map((job) => job.updated_at), now),
    },
    {
      id: 'deployment',
      label: 'Deployment',
      status: 'staged',
      summary: 'Canary rollout is prepared for the selected camera.',
      detail: 'Deployment state is explicit, so rollout and rollback can be inspected without guessing.',
      count: deployments.length,
      latestAt: latestTimestamp(deployments.map((deployment) => deployment.updated_at), now),
    },
  ];

  const modelLifecycle: Phase10ModelLifecycle = {
    source: 'fallback',
    partialFallbacks: ['model_lifecycle'],
    annotations,
    datasets,
    trainingJobs,
    models,
    deployments,
    stages,
    summary: {
      annotations: annotations.length,
      datasets: datasets.length,
      trainingJobs: trainingJobs.length,
      models: models.length,
      deployments: deployments.length,
      activeTrainingJobs: trainingJobs.filter((job) => job.status === 'running').length,
      productionDeployments: deployments.filter((deployment) => deployment.status === 'production').length,
    },
    integrationNote: 'Annotation, training, and deployment remain visible even when the ML overview endpoint is empty.',
    updatedAt: now,
  };

  const modules = [
    buildModuleSummary('lpr', 1, 1, watchlists[0]?.lastSeenAt ?? now),
    buildModuleSummary('face', 1, 1, watchlists[1]?.lastSeenAt ?? now),
    buildModuleSummary('reid', 1, 1, reidTracks[0]?.updatedAt ?? now),
  ];

  const reviewQueue = events.filter((event) => event.reviewState === 'review').length + annotations.length;

  return {
    source: 'fallback',
    partialFallbacks: ['specialized_intelligence', 'model_lifecycle'],
    modules,
    watchlists,
    events,
    reidTracks,
    modelLifecycle,
    summary: {
      activeModules: modules.filter((module) => module.enabled).length,
      watchedSubjects: watchlists.filter((entry) => entry.status !== 'disabled').length,
      reviewQueue,
      qualityScore: Math.round(modules.reduce((sum, module) => sum + module.qualityScore, 0) / Math.max(1, modules.length)),
      annotationTasks: annotations.length,
      trainingJobs: trainingJobs.length,
      deployments: deployments.length,
    },
    integrationNote:
      'Wave D keeps Specialized Intelligence and Model Lifecycle aligned around the same workspace, even when live API data is missing.',
    updatedAt: now,
  };
}

function normalizeWatchlist(entry: ApiWatchlist, cameraName: string): Phase9WatchlistEntry {
  return {
    id: entry.id,
    module: entry.kind === 'face' ? 'face' : 'lpr',
    label: entry.name,
    signal: entry.entries?.[0] ?? entry.description ?? 'No watchlist entries provided',
    status: entry.enabled === false ? 'disabled' : 'watching',
    privacyMode:
      entry.kind === 'face'
        ? 'Opt-in profile'
        : entry.disposition === 'deny'
          ? 'Block list'
          : 'Plate watchlist',
    confidence: normalizeConfidence(entry.severity === 'critical' ? 0.97 : entry.severity === 'high' ? 0.89 : 0.78),
    lastSeenAt: entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
    cameraName,
    evidenceLabel: summarizeLabelList(entry.tags ?? [], 'Evidence pending'),
  };
}

function normalizeEventFromPlateRead(read: ApiPlateRead, cameraName: string): Phase9IdentityEvent {
  return {
    id: read.id,
    module: 'lpr',
    title: `Plate read ${read.plate_text}`,
    subtitle: `Direction ${read.direction ?? 'unknown'}${read.vehicle_type ? `, ${read.vehicle_type}` : ''}.`,
    confidence: normalizeConfidence(read.confidence ?? 0.75),
    risk: read.watchlist_id ? 'high' : 'medium',
    reviewState: read.watchlist_id ? 'review' : 'watching',
    watchlistId: read.watchlist_id ?? null,
    cameraName,
    evidenceHref: null,
    createdAt: read.occurred_at ?? read.created_at ?? new Date().toISOString(),
  };
}

function normalizeEventFromFaceMatch(match: ApiFaceMatch, cameraName: string): Phase9IdentityEvent {
  return {
    id: match.id,
    module: 'face',
    title: match.subject_label,
    subtitle: `Face match status ${match.status ?? 'possible_match'}.`,
    confidence: normalizeConfidence(match.confidence ?? 0.75),
    risk: match.status === 'match' ? 'high' : 'medium',
    reviewState: match.status === 'match' ? 'review' : 'watching',
    watchlistId: match.watchlist_id ?? null,
    cameraName,
    evidenceHref: null,
    createdAt: match.occurred_at ?? match.created_at ?? new Date().toISOString(),
  };
}

function normalizeEventFromReIdLink(link: ApiReIdLink, cameraName: string): Phase9IdentityEvent {
  return {
    id: link.id,
    module: 'reid',
    title: `${link.source_track_id} -> ${link.target_track_id}`,
    subtitle: link.movement_hint ?? 'Movement hint pending.',
    confidence: normalizeConfidence(link.confidence ?? 0.75),
    risk: link.status === 'linked' ? 'medium' : 'low',
    reviewState: link.status === 'linked' ? 'cleared' : 'watching',
    watchlistId: null,
    cameraName,
    evidenceHref: null,
    createdAt: link.occurred_at ?? link.created_at ?? new Date().toISOString(),
  };
}

function normalizeTrack(link: ApiReIdLink, cameraName: string): Phase9ReIdTrack {
  return {
    id: link.id,
    label: `${link.source_track_id} to ${link.target_track_id}`,
    cameras: [link.origin_camera_id ?? cameraName, link.target_camera_id ?? cameraName].filter(Boolean),
    movementHint: link.movement_hint ?? 'Movement hint pending.',
    continuity: normalizeConfidence(link.confidence ?? 0.75),
    status: link.status === 'rejected' ? 'stale' : (link.status ?? 'candidate'),
    updatedAt: link.updated_at ?? link.created_at ?? new Date().toISOString(),
  };
}

function buildIntelligenceWorkspace(
  overview: ApiIntelligenceOverview | null,
  params: Phase9LoadParams
): {
  source: Phase9Source;
  partialFallbacks: Phase9FallbackPart[];
  modules: Phase9ModuleCard[];
  watchlists: Phase9WatchlistEntry[];
  events: Phase9IdentityEvent[];
  reidTracks: Phase9ReIdTrack[];
  summary: {
    activeModules: number;
    watchedSubjects: number;
    reviewQueue: number;
    qualityScore: number;
  };
  integrationNote: string;
  updatedAt: string;
} {
  const now = new Date().toISOString();
  const hasApiData =
    Boolean(overview) &&
    ((overview?.watchlists.length ?? 0) +
      (overview?.identity_profiles.length ?? 0) +
      (overview?.plate_reads.length ?? 0) +
      (overview?.face_matches.length ?? 0) +
      (overview?.reid_links.length ?? 0) >
      0);

  if (!hasApiData) {
    const fallback = buildFallbackWorkspace(params);
    return {
      source: 'fallback',
      partialFallbacks: ['specialized_intelligence'],
      modules: fallback.modules,
      watchlists: fallback.watchlists,
      events: fallback.events,
      reidTracks: fallback.reidTracks,
      summary: {
        activeModules: fallback.summary.activeModules,
        watchedSubjects: fallback.summary.watchedSubjects,
        reviewQueue: fallback.summary.reviewQueue,
        qualityScore: fallback.summary.qualityScore,
      },
      integrationNote: fallback.integrationNote,
      updatedAt: fallback.updatedAt,
    };
  }

  const watchlists = (overview?.watchlists ?? []).map((entry) => normalizeWatchlist(entry, params.cameraName));
  const plateReads = overview?.plate_reads ?? [];
  const faceMatches = overview?.face_matches ?? [];
  const reIdLinks = overview?.reid_links ?? [];
  const modules = [
    buildModuleSummary(
      'lpr',
      watchlists.filter((entry) => entry.module === 'lpr').length,
      plateReads.length,
      latestTimestamp(plateReads.map((read) => read.updated_at ?? read.created_at), now)
    ),
    buildModuleSummary(
      'face',
      watchlists.filter((entry) => entry.module === 'face').length,
      faceMatches.length,
      latestTimestamp(faceMatches.map((match) => match.updated_at ?? match.created_at), now),
      faceMatches.length > 0 || (overview?.identity_profiles.length ?? 0) > 0
    ),
    buildModuleSummary(
      'reid',
      reIdLinks.length,
      reIdLinks.length,
      latestTimestamp(reIdLinks.map((link) => link.updated_at ?? link.created_at), now)
    ),
  ];

  const events: Phase9IdentityEvent[] = [
    ...plateReads.map((read) => normalizeEventFromPlateRead(read, params.cameraName)),
    ...faceMatches.map((match) => normalizeEventFromFaceMatch(match, params.cameraName)),
    ...reIdLinks.map((link) => normalizeEventFromReIdLink(link, params.cameraName)),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const reidTracks = reIdLinks.map((link) => normalizeTrack(link, params.cameraName));
  const reviewQueue = events.filter((event) => event.reviewState === 'review').length;

  return {
    source: 'api',
    partialFallbacks: [],
    modules,
    watchlists,
    events,
    reidTracks,
    summary: {
      activeModules: modules.filter((module) => module.enabled).length,
      watchedSubjects: watchlists.filter((entry) => entry.status !== 'disabled').length,
      reviewQueue,
      qualityScore: Math.round(modules.reduce((sum, module) => sum + module.qualityScore, 0) / Math.max(1, modules.length)),
    },
    integrationNote: 'Specialized Intelligence is backed by /api/intelligence/overview and stays optional in the operator flow.',
    updatedAt: now,
  };
}

function normalizeAnnotationTask(task: ApiAnnotationTask, cameraName: string): ApiAnnotationTask {
  return {
    ...task,
    camera_id: task.camera_id ?? cameraName,
    site_id: task.site_id ?? null,
    label_schema: task.label_schema ?? [],
  };
}

function normalizeDataset(dataset: ApiDatasetVersion): ApiDatasetVersion {
  return {
    ...dataset,
    annotation_task_ids: dataset.annotation_task_ids ?? [],
    class_distribution: dataset.class_distribution ?? {},
  };
}

function normalizeTrainingJob(job: ApiTrainingJob): ApiTrainingJob {
  return {
    ...job,
    metrics: job.metrics ?? {},
  };
}

function normalizeModel(model: ApiModel): ApiModel {
  return {
    ...model,
    metrics: model.metrics ?? {},
    metadata: model.metadata ?? {},
  };
}

function normalizeDeployment(deployment: ApiDeployment): ApiDeployment {
  return {
    ...deployment,
    config: deployment.config ?? {},
  };
}

function buildModelLifecycleWorkspace(
  overview: ApiMlOverview | null,
  params: Phase9LoadParams
): Phase10ModelLifecycle {
  const now = new Date().toISOString();
  const hasApiData =
    Boolean(overview) &&
    ((overview?.annotations.length ?? 0) +
      (overview?.datasets.length ?? 0) +
      (overview?.training_jobs.length ?? 0) +
      (overview?.models.length ?? 0) +
      (overview?.deployments.length ?? 0) >
      0);

  if (!hasApiData) {
    return buildFallbackWorkspace(params).modelLifecycle;
  }

  const annotations = (overview?.annotations ?? []).map((annotation) => normalizeAnnotationTask(annotation, params.cameraName));
  const datasets = (overview?.datasets ?? []).map(normalizeDataset);
  const trainingJobs = (overview?.training_jobs ?? []).map(normalizeTrainingJob);
  const models = (overview?.models ?? []).map(normalizeModel);
  const deployments = (overview?.deployments ?? []).map(normalizeDeployment);

  const latestAnnotationAt = latestTimestamp(annotations.map((annotation) => annotation.updated_at), now);
  const latestTrainingAt = latestTimestamp(trainingJobs.map((job) => job.updated_at), now);
  const latestDeploymentAt = latestTimestamp(deployments.map((deployment) => deployment.updated_at), now);

  const stages: Phase10LifecycleStage[] = [
    {
      id: 'annotation',
      label: 'Annotation',
      status: annotations.some((annotation) => annotation.status === 'review' || annotation.status === 'labeling')
        ? 'running'
        : annotations.length > 0
          ? 'completed'
          : 'queued',
      summary: `${annotations.length} tasks are ready for review, labeling, or export.`,
      detail: 'Operators can move from incident context into labeling without losing the operational trail.',
      count: annotations.length,
      latestAt: latestAnnotationAt,
    },
    {
      id: 'training',
      label: 'Training',
      status: trainingJobs.some((job) => job.status === 'running')
        ? 'running'
        : trainingJobs.some((job) => job.status === 'completed')
          ? 'completed'
          : trainingJobs.length > 0
            ? 'queued'
            : 'queued',
      summary: `${trainingJobs.length} training job${trainingJobs.length === 1 ? '' : 's'} are tracked in the pipeline.`,
      detail: 'Dataset versions and training jobs stay visible together so the model state is never implied.',
      count: trainingJobs.length,
      latestAt: latestTrainingAt,
    },
    {
      id: 'deployment',
      label: 'Deployment',
      status: deployments.some((deployment) => deployment.status === 'production')
        ? 'production'
        : deployments.some((deployment) => deployment.status === 'canary')
          ? 'staged'
          : deployments.some((deployment) => deployment.status === 'staged')
            ? 'staged'
            : deployments.length > 0
              ? 'rollback'
              : 'queued',
      summary: `${deployments.length} deployment${deployments.length === 1 ? '' : 's'} are tracked for rollout.`,
      detail: 'Rollout strategy, worker type, and scope remain explicit for safer operator decisions.',
      count: deployments.length,
      latestAt: latestDeploymentAt,
    },
  ];

  return {
    source: 'api',
    partialFallbacks: [],
    annotations,
    datasets,
    trainingJobs,
    models,
    deployments,
    stages,
    summary: {
      annotations: annotations.length,
      datasets: datasets.length,
      trainingJobs: trainingJobs.length,
      models: models.length,
      deployments: deployments.length,
      activeTrainingJobs: trainingJobs.filter((job) => job.status === 'running').length,
      productionDeployments: deployments.filter((deployment) => deployment.status === 'production').length,
    },
    integrationNote: 'Model lifecycle is backed by /api/ml/overview and stays aligned with the same operator workspace.',
    updatedAt: now,
  };
}

export async function loadWaveDWorkspace(params: Phase9LoadParams): Promise<Phase9Workspace> {
  const searchParams = new URLSearchParams({
    camera_id: params.cameraId,
    page: '1',
    pageSize: '50',
  });

  const incidentId = params.incidents[0]?.id;
  if (incidentId) {
    searchParams.set('incident_id', incidentId);
  }

  const [intelligenceOverview, mlOverview] = await Promise.all([
    fetchJson<ApiIntelligenceOverview>(`/api/intelligence/overview?${searchParams.toString()}`, params.token, params.signal),
    fetchJson<ApiMlOverview>('/api/ml/overview', params.token, params.signal),
  ]);

  const intelligence = buildIntelligenceWorkspace(intelligenceOverview, params);
  const modelLifecycle = buildModelLifecycleWorkspace(mlOverview, params);
  const partialFallbacks = [...intelligence.partialFallbacks, ...modelLifecycle.partialFallbacks];
  const updatedAt = latestTimestamp([intelligence.updatedAt, modelLifecycle.updatedAt], new Date().toISOString());

  return {
    source: intelligence.source === 'api' && modelLifecycle.source === 'api' ? 'api' : 'fallback',
    partialFallbacks,
    modules: intelligence.modules,
    watchlists: intelligence.watchlists,
    events: intelligence.events,
    reidTracks: intelligence.reidTracks,
    modelLifecycle,
    summary: {
      activeModules: intelligence.summary.activeModules,
      watchedSubjects: intelligence.summary.watchedSubjects,
      reviewQueue: intelligence.summary.reviewQueue,
      qualityScore: clamp(
        Math.round((intelligence.summary.qualityScore + modelLifecycle.summary.annotations + modelLifecycle.summary.deployments) / 3),
        0,
        100
      ),
      annotationTasks: modelLifecycle.summary.annotations,
      trainingJobs: modelLifecycle.summary.trainingJobs,
      deployments: modelLifecycle.summary.deployments,
    },
    integrationNote:
      partialFallbacks.length > 0
        ? `Wave D is live with local fallback coverage for ${partialFallbacks.join(', ')}.`
        : 'Wave D is fully backed by /api/intelligence/overview and /api/ml/overview.',
    updatedAt,
  };
}

export async function loadPhase9Workspace(params: Phase9LoadParams): Promise<Phase9Workspace> {
  return loadWaveDWorkspace(params);
}
