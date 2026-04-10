import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type StorageReplicationJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface StorageReplicationJob {
  id: string;
  tenant_id: string;
  storage_target_id: string;
  object_copy_id: string | null;
  source_path: string;
  destination_path: string;
  status: StorageReplicationJobStatus;
  attempts: number;
  bytes_total: number;
  bytes_transferred: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class StorageReplicationJobRepository extends BaseRepository<StorageReplicationJob> {
  constructor(pool: Pool) {
    super(pool, 'storage_replication_jobs');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<StorageReplicationJob>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM storage_replication_jobs WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<StorageReplicationJob>(
      `
      SELECT * FROM storage_replication_jobs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [tenantId, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }

  async findByTargetId(storageTargetId: string): Promise<StorageReplicationJob[]> {
    const result = await this.query<StorageReplicationJob>(
      `
      SELECT * FROM storage_replication_jobs
      WHERE storage_target_id = $1
      ORDER BY created_at DESC
      `,
      [storageTargetId]
    );

    return result.rows;
  }

  async findPending(limit: number = 100): Promise<StorageReplicationJob[]> {
    const result = await this.query<StorageReplicationJob>(
      `
      SELECT * FROM storage_replication_jobs
      WHERE status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows;
  }

  async updateStatus(
    id: string,
    status: StorageReplicationJobStatus,
    updates: {
      attempts?: number;
      bytes_transferred?: number;
      last_error?: string | null;
    } = {}
  ): Promise<StorageReplicationJob | null> {
    const result = await this.query<StorageReplicationJob>(
      `
      UPDATE storage_replication_jobs
      SET
        status = $1,
        attempts = COALESCE($2, attempts),
        bytes_transferred = COALESCE($3, bytes_transferred),
        last_error = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [
        status,
        updates.attempts ?? null,
        updates.bytes_transferred ?? null,
        updates.last_error ?? null,
        id,
      ]
    );

    return result.rows[0] ?? null;
  }
}
