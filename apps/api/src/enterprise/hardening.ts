import type {
  AlertRouteRepository,
  EnrichmentRepository,
  EventRepository,
  Incident,
  IncidentRepository,
  ModelLifecycleRepository,
  PolicyRepository,
  SiteRepository,
  SpecializedIntelligenceRepository,
  StorageReplicationJobRepository,
  StorageTargetRepository,
  Tenant,
  TenantHardeningRepository,
  TenantQuotaRecord,
  TenantRepository,
  CameraRepository,
} from '../db/repositories/index.js';

type TenantUsageSnapshot = {
  site_count: number;
  camera_count: number;
  open_incident_count: number;
  policy_count: number;
  alert_route_count: number;
  storage_target_count: number;
  pending_replication_count: number;
  failed_replication_count: number;
  watchlist_count: number;
  identity_profile_count: number;
  training_job_count: number;
  deployment_count: number;
};

type BuildTenantHardeningContext = {
  tenantRepository: Pick<TenantRepository, 'findAll'>;
  tenantHardeningRepository: TenantHardeningRepository;
  siteRepository: Pick<SiteRepository, 'findByTenantId'>;
  cameraRepository: Pick<CameraRepository, 'findBySiteId'>;
  incidentRepository: Pick<IncidentRepository, 'findAll'>;
  policyRepository: Pick<PolicyRepository, 'findByTenantId'>;
  alertRouteRepository: Pick<AlertRouteRepository, 'findByPolicyId'>;
  storageTargetRepository: Pick<StorageTargetRepository, 'findByTenantId'>;
  storageReplicationJobRepository: Pick<StorageReplicationJobRepository, 'findByTenantId'>;
  specializedIntelligenceRepository: Pick<
    SpecializedIntelligenceRepository,
    'listWatchlists' | 'listIdentityProfiles'
  >;
  modelLifecycleRepository: Pick<ModelLifecycleRepository, 'listTrainingJobs' | 'listDeployments'>;
};

type BuildObservabilityContext = Omit<
  BuildTenantHardeningContext,
  'tenantRepository' | 'tenantHardeningRepository'
> & {
  enrichmentRepository: Pick<EnrichmentRepository, 'findByTenantId'>;
  eventRepository: Pick<EventRepository, 'findByTenantId'>;
};

function quotaRatio(used: number, limit: number): number {
  if (limit <= 0) {
    return 1;
  }
  return used / limit;
}

function quotaStatus(quota: TenantQuotaRecord, usage: TenantUsageSnapshot): 'healthy' | 'warning' | 'breach' {
  const ratios = [
    quotaRatio(usage.site_count, quota.max_sites),
    quotaRatio(Math.ceil(usage.camera_count / Math.max(1, usage.site_count)), quota.max_cameras_per_site),
    quotaRatio(usage.storage_target_count, quota.max_storage_targets),
  ];

  if (ratios.some((ratio) => ratio > 1)) {
    return 'breach';
  }
  if (ratios.some((ratio) => ratio >= 0.8) || usage.failed_replication_count > 0) {
    return 'warning';
  }
  return 'healthy';
}

function tenantWarnings(quota: TenantQuotaRecord, usage: TenantUsageSnapshot): string[] {
  const warnings: string[] = [];
  if (usage.failed_replication_count > 0) {
    warnings.push(`${usage.failed_replication_count} failed replications require review.`);
  }
  if (usage.pending_replication_count > 3) {
    warnings.push(`Replication backlog is elevated with ${usage.pending_replication_count} pending jobs.`);
  }
  if (quotaRatio(usage.site_count, quota.max_sites) >= 0.8) {
    warnings.push('Site quota is close to saturation.');
  }
  const camerasPerSite = Math.ceil(usage.camera_count / Math.max(1, usage.site_count));
  if (quotaRatio(camerasPerSite, quota.max_cameras_per_site) >= 0.8) {
    warnings.push('Camera density per site is close to quota.');
  }
  if (!quota.enabled_modules.includes('training') && usage.training_job_count > 0) {
    warnings.push('Training jobs exist although the training module is not enabled in quota policy.');
  }
  return warnings;
}

async function buildTenantUsage(
  tenantId: string,
  context: Omit<BuildTenantHardeningContext, 'tenantRepository' | 'tenantHardeningRepository'>
): Promise<TenantUsageSnapshot> {
  const sitesPage = await context.siteRepository.findByTenantId(tenantId, { limit: 100, offset: 0 });
  const cameraPages = await Promise.all(
    sitesPage.data.map((site) => context.cameraRepository.findBySiteId(site.id, { limit: 100, offset: 0 }))
  );
  const incidentsPage = await context.incidentRepository.findAll({ tenant_id: tenantId }, { limit: 200, offset: 0 });
  const policiesPage = await context.policyRepository.findByTenantId(tenantId, { limit: 100, offset: 0 });
  const alertRoutes = await Promise.all(
    policiesPage.data.map((policy) => context.alertRouteRepository.findByPolicyId(policy.id))
  );
  const storageTargetsPage = await context.storageTargetRepository.findByTenantId(tenantId, { limit: 100, offset: 0 });
  const replicationJobsPage = await context.storageReplicationJobRepository.findByTenantId(tenantId, { limit: 200, offset: 0 });
  const watchlistsPage = await context.specializedIntelligenceRepository.listWatchlists(tenantId, { limit: 100, offset: 0 });
  const profilesPage = await context.specializedIntelligenceRepository.listIdentityProfiles(tenantId, { limit: 100, offset: 0 });
  const trainingJobsPage = await context.modelLifecycleRepository.listTrainingJobs(tenantId, { limit: 100, offset: 0 });
  const deploymentsPage = await context.modelLifecycleRepository.listDeployments(tenantId, { limit: 100, offset: 0 });

  return {
    site_count: sitesPage.total,
    camera_count: cameraPages.reduce((sum, page) => sum + page.total, 0),
    open_incident_count: incidentsPage.data.filter((incident: Incident) => incident.status !== 'closed').length,
    policy_count: policiesPage.total,
    alert_route_count: alertRoutes.reduce((sum, routes) => sum + routes.length, 0),
    storage_target_count: storageTargetsPage.total,
    pending_replication_count: replicationJobsPage.data.filter((job) => job.status === 'pending' || job.status === 'running').length,
    failed_replication_count: replicationJobsPage.data.filter((job) => job.status === 'failed').length,
    watchlist_count: watchlistsPage.total,
    identity_profile_count: profilesPage.total,
    training_job_count: trainingJobsPage.total,
    deployment_count: deploymentsPage.total,
  };
}

export async function buildTenantHardeningOverview(
  context: BuildTenantHardeningContext
): Promise<{
  tenants: Array<{
    tenant: Tenant;
    quota: TenantQuotaRecord;
    usage: TenantUsageSnapshot;
    quota_status: 'healthy' | 'warning' | 'breach';
    warnings: string[];
  }>;
  summary: {
    tenant_count: number;
    breach_count: number;
    warning_count: number;
  };
}> {
  const tenantsPage = await context.tenantRepository.findAll({}, { limit: 100, offset: 0 });
  const records = await Promise.all(
    tenantsPage.data.map(async (tenant) => {
      const quota =
        (await context.tenantHardeningRepository.findTenantQuotaByTenantId(tenant.id)) ??
        (await context.tenantHardeningRepository.upsertTenantQuota(tenant.id, {}));
      const usage = await buildTenantUsage(tenant.id, context);
      const status = quotaStatus(quota, usage);
      return {
        tenant,
        quota,
        usage,
        quota_status: status,
        warnings: tenantWarnings(quota, usage),
      };
    })
  );

  return {
    tenants: records,
    summary: {
      tenant_count: records.length,
      breach_count: records.filter((record) => record.quota_status === 'breach').length,
      warning_count: records.filter((record) => record.quota_status === 'warning').length,
    },
  };
}

export async function buildObservabilityOverview(
  tenantId: string,
  context: BuildObservabilityContext
): Promise<{
  scope_tenant_id: string;
  summary: {
    site_count: number;
    camera_count: number;
    open_incident_count: number;
    pending_enrichment_count: number;
    pending_replication_count: number;
    failed_replication_count: number;
    active_training_jobs: number;
    canary_deployments: number;
  };
  services: Array<{
    name: string;
    status: 'healthy' | 'warning' | 'degraded';
    summary: string;
    updated_at: string;
  }>;
  signals: {
    structured_logs: boolean;
    metrics_available: boolean;
    trace_correlation: boolean;
    dashboard_ready: boolean;
  };
  updated_at: string;
}> {
  const updatedAt = new Date().toISOString();
  const usage = await buildTenantUsage(tenantId, context);
  const enrichmentsPage = await context.enrichmentRepository.findByTenantId(tenantId, { limit: 200, offset: 0 });
  const eventsPage = await context.eventRepository.findByTenantId(tenantId, { limit: 200, offset: 0 });
  const activeTrainingJobs = usage.training_job_count;
  const canaryDeployments = (
    await context.modelLifecycleRepository.listDeployments(tenantId, { limit: 100, offset: 0 })
  ).data.filter((deployment) => deployment.status === 'canary').length;

  return {
    scope_tenant_id: tenantId,
    summary: {
      site_count: usage.site_count,
      camera_count: usage.camera_count,
      open_incident_count: usage.open_incident_count,
      pending_enrichment_count: enrichmentsPage.data.filter((item) => item.status !== 'completed').length,
      pending_replication_count: usage.pending_replication_count,
      failed_replication_count: usage.failed_replication_count,
      active_training_jobs: activeTrainingJobs,
      canary_deployments: canaryDeployments,
    },
    services: [
      {
        name: 'api',
        status: 'healthy',
        summary: `${eventsPage.total} events and ${usage.open_incident_count} open incidents are queryable.`,
        updated_at: updatedAt,
      },
      {
        name: 'storage',
        status: usage.failed_replication_count > 0 ? 'degraded' : usage.pending_replication_count > 0 ? 'warning' : 'healthy',
        summary:
          usage.failed_replication_count > 0
            ? `${usage.failed_replication_count} replications failed and require replay.`
            : `${usage.pending_replication_count} replications are queued or running.`,
        updated_at: updatedAt,
      },
      {
        name: 'intelligence',
        status: usage.watchlist_count > 0 ? 'healthy' : 'warning',
        summary: `${usage.watchlist_count} watchlists and ${usage.identity_profile_count} profiles are in scope.`,
        updated_at: updatedAt,
      },
      {
        name: 'ml-lifecycle',
        status: activeTrainingJobs > 0 || canaryDeployments > 0 ? 'warning' : 'healthy',
        summary: `${activeTrainingJobs} training jobs and ${canaryDeployments} canary deployments are active.`,
        updated_at: updatedAt,
      },
    ],
    signals: {
      structured_logs: true,
      metrics_available: true,
      trace_correlation: true,
      dashboard_ready: true,
    },
    updated_at: updatedAt,
  };
}
