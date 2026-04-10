import { z } from 'zod';
import { isoTimestampSchema } from '../common/timestamp';
import { tenantIdSchema } from '../common/id';
import { tenantSchema } from './tenant';

export const tenantQuotaSchema = z.object({
  tenant_id: tenantIdSchema,
  max_sites: z.number().int().positive(),
  max_cameras_per_site: z.number().int().positive(),
  max_storage_targets: z.number().int().positive(),
  max_monthly_exports: z.number().int().nonnegative(),
  max_retention_days: z.number().int().positive(),
  enabled_modules: z.array(z.string().min(1)),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type TenantQuota = z.infer<typeof tenantQuotaSchema>;

export const tenantUsageSnapshotSchema = z.object({
  site_count: z.number().int().nonnegative(),
  camera_count: z.number().int().nonnegative(),
  open_incident_count: z.number().int().nonnegative(),
  policy_count: z.number().int().nonnegative(),
  alert_route_count: z.number().int().nonnegative(),
  storage_target_count: z.number().int().nonnegative(),
  pending_replication_count: z.number().int().nonnegative(),
  failed_replication_count: z.number().int().nonnegative(),
  watchlist_count: z.number().int().nonnegative(),
  identity_profile_count: z.number().int().nonnegative(),
  training_job_count: z.number().int().nonnegative(),
  deployment_count: z.number().int().nonnegative(),
});

export type TenantUsageSnapshot = z.infer<typeof tenantUsageSnapshotSchema>;

export const hardeningStatusSchema = z.enum(['healthy', 'warning', 'degraded', 'breach']);
export type HardeningStatus = z.infer<typeof hardeningStatusSchema>;

export const observabilityServiceSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['healthy', 'warning', 'degraded']),
  summary: z.string().min(1),
  updated_at: isoTimestampSchema,
});

export type ObservabilityService = z.infer<typeof observabilityServiceSchema>;

export const observabilityOverviewSchema = z.object({
  scope_tenant_id: tenantIdSchema,
  summary: z.object({
    site_count: z.number().int().nonnegative(),
    camera_count: z.number().int().nonnegative(),
    open_incident_count: z.number().int().nonnegative(),
    pending_enrichment_count: z.number().int().nonnegative(),
    pending_replication_count: z.number().int().nonnegative(),
    failed_replication_count: z.number().int().nonnegative(),
    active_training_jobs: z.number().int().nonnegative(),
    canary_deployments: z.number().int().nonnegative(),
  }),
  services: z.array(observabilityServiceSchema),
  signals: z.object({
    structured_logs: z.boolean(),
    metrics_available: z.boolean(),
    trace_correlation: z.boolean(),
    dashboard_ready: z.boolean(),
  }),
  updated_at: isoTimestampSchema,
});

export type ObservabilityOverview = z.infer<typeof observabilityOverviewSchema>;

export const tenantHardeningOverviewSchema = z.object({
  tenant: tenantSchema,
  quota: tenantQuotaSchema,
  usage: tenantUsageSnapshotSchema,
  quota_status: hardeningStatusSchema,
  warnings: z.array(z.string()),
});

export type TenantHardeningOverview = z.infer<typeof tenantHardeningOverviewSchema>;
