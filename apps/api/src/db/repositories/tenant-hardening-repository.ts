import type { PaginatedResult, PaginationOptions } from './base-repository';

export interface TenantQuotaRecord {
  tenant_id: string;
  max_sites: number;
  max_cameras_per_site: number;
  max_storage_targets: number;
  max_monthly_exports: number;
  max_retention_days: number;
  enabled_modules: string[];
  created_at: string;
  updated_at: string;
}

export interface TenantQuotaUpsertInput {
  max_sites?: number;
  max_cameras_per_site?: number;
  max_storage_targets?: number;
  max_monthly_exports?: number;
  max_retention_days?: number;
  enabled_modules?: string[];
}

export interface TenantHardeningRepository {
  listTenantQuotas(
    pagination?: PaginationOptions,
    filters?: { tenant_id?: string }
  ): Promise<PaginatedResult<TenantQuotaRecord>>;
  findTenantQuotaByTenantId(tenantId: string): Promise<TenantQuotaRecord | null>;
  upsertTenantQuota(tenantId: string, input: TenantQuotaUpsertInput): Promise<TenantQuotaRecord>;
}
