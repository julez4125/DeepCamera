import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type StorageTargetType = 's3' | 'smb' | 'nfs' | 'local';
export type StorageTargetStatus = 'unknown' | 'healthy' | 'degraded' | 'unreachable';

export interface StorageTarget {
  id: string;
  tenant_id: string;
  name: string;
  target_type: StorageTargetType;
  status: StorageTargetStatus;
  config: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorageTargetCredentialRecord {
  id: string;
  storage_target_id: string;
  credentials: Record<string, unknown>;
  rotated_at: string;
  created_at: string;
  updated_at: string;
}

export class StorageTargetRepository extends BaseRepository<StorageTarget> {
  constructor(pool: Pool) {
    super(pool, 'storage_targets');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<StorageTarget>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM storage_targets WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<StorageTarget>(
      `
      SELECT * FROM storage_targets
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

  async updateStatus(
    id: string,
    status: StorageTargetStatus,
    errorMessage: string | null = null
  ): Promise<StorageTarget | null> {
    const result = await this.query<StorageTarget>(
      `
      UPDATE storage_targets
      SET status = $1, last_error = $2, last_checked_at = NOW(), updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [status, errorMessage, id]
    );

    return result.rows[0] ?? null;
  }

  async rotateCredentials(
    storageTargetId: string,
    credentials: Record<string, unknown>
  ): Promise<void> {
    await this.query(
      `
      INSERT INTO storage_target_credentials (
        storage_target_id,
        credentials,
        rotated_at
      )
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (storage_target_id)
      DO UPDATE SET
        credentials = EXCLUDED.credentials,
        rotated_at = NOW(),
        updated_at = NOW()
      `,
      [storageTargetId, JSON.stringify(credentials)]
    );
  }
}
