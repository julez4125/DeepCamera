import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export interface StoragePolicyAssignment {
  id: string;
  tenant_id: string;
  storage_target_id: string;
  site_id: string | null;
  camera_id: string | null;
  path_prefix: string | null;
  retention_days: number;
  replication_enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface StoragePolicyAssignmentInput {
  tenant_id: string;
  storage_target_id: string;
  site_id?: string | null;
  camera_id?: string | null;
  path_prefix?: string | null;
  retention_days?: number;
  replication_enabled?: boolean;
  priority?: number;
}

export class StoragePolicyAssignmentRepository extends BaseRepository<StoragePolicyAssignment> {
  constructor(pool: Pool) {
    super(pool, 'camera_storage_policies');
  }

  async findByTargetId(
    storageTargetId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<StoragePolicyAssignment>> {
    return this.findAll({ storage_target_id: storageTargetId }, pagination);
  }

  async findBySiteId(siteId: string): Promise<StoragePolicyAssignment[]> {
    const result = await this.query<StoragePolicyAssignment>(
      `
      SELECT * FROM camera_storage_policies
      WHERE site_id = $1
      ORDER BY priority ASC, created_at DESC
      `,
      [siteId]
    );

    return result.rows;
  }

  async findByCameraId(cameraId: string): Promise<StoragePolicyAssignment[]> {
    const result = await this.query<StoragePolicyAssignment>(
      `
      SELECT * FROM camera_storage_policies
      WHERE camera_id = $1
      ORDER BY priority ASC, created_at DESC
      `,
      [cameraId]
    );

    return result.rows;
  }

  async assignToSite(input: StoragePolicyAssignmentInput): Promise<StoragePolicyAssignment> {
    const existing = await this.query<StoragePolicyAssignment>(
      `
      SELECT * FROM camera_storage_policies
      WHERE storage_target_id = $1 AND site_id = $2 AND camera_id IS NULL
      LIMIT 1
      `,
      [input.storage_target_id, input.site_id]
    );

    if (existing.rows[0]) {
      const updated = await this.update(existing.rows[0].id, {
        path_prefix: input.path_prefix ?? null,
        retention_days: input.retention_days ?? 30,
        replication_enabled: input.replication_enabled ?? true,
        priority: input.priority ?? 100,
      });

      return updated!;
    }

    return this.create({
      tenant_id: input.tenant_id,
      storage_target_id: input.storage_target_id,
      site_id: input.site_id ?? null,
      camera_id: null,
      path_prefix: input.path_prefix ?? null,
      retention_days: input.retention_days ?? 30,
      replication_enabled: input.replication_enabled ?? true,
      priority: input.priority ?? 100,
    });
  }

  async assignToCamera(input: StoragePolicyAssignmentInput): Promise<StoragePolicyAssignment> {
    const existing = await this.query<StoragePolicyAssignment>(
      `
      SELECT * FROM camera_storage_policies
      WHERE storage_target_id = $1 AND camera_id = $2 AND site_id IS NULL
      LIMIT 1
      `,
      [input.storage_target_id, input.camera_id]
    );

    if (existing.rows[0]) {
      const updated = await this.update(existing.rows[0].id, {
        path_prefix: input.path_prefix ?? null,
        retention_days: input.retention_days ?? 30,
        replication_enabled: input.replication_enabled ?? true,
        priority: input.priority ?? 100,
      });

      return updated!;
    }

    return this.create({
      tenant_id: input.tenant_id,
      storage_target_id: input.storage_target_id,
      site_id: null,
      camera_id: input.camera_id ?? null,
      path_prefix: input.path_prefix ?? null,
      retention_days: input.retention_days ?? 30,
      replication_enabled: input.replication_enabled ?? true,
      priority: input.priority ?? 100,
    });
  }
}
