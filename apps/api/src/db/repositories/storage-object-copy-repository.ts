import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type StorageObjectCopyStatus =
  | 'local_only'
  | 'replicating'
  | 'replicated'
  | 'degraded'
  | 'failed';

export interface StorageObjectCopy {
  id: string;
  tenant_id: string;
  clip_id: string | null;
  recording_id: string | null;
  storage_target_id: string;
  object_path: string;
  copy_status: StorageObjectCopyStatus;
  checksum: string | null;
  size_bytes: number | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export class StorageObjectCopyRepository extends BaseRepository<StorageObjectCopy> {
  constructor(pool: Pool) {
    super(pool, 'storage_object_copies');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<StorageObjectCopy>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM storage_object_copies WHERE tenant_id = $1',
      [tenantId]
    );
    const total = Number.parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<StorageObjectCopy>(
      `
      SELECT * FROM storage_object_copies
      WHERE tenant_id = $1
      ORDER BY updated_at DESC
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

  async findByTargetId(storageTargetId: string): Promise<StorageObjectCopy[]> {
    const result = await this.query<StorageObjectCopy>(
      `
      SELECT * FROM storage_object_copies
      WHERE storage_target_id = $1
      ORDER BY updated_at DESC
      `,
      [storageTargetId]
    );

    return result.rows;
  }

  async findByClipId(clipId: string): Promise<StorageObjectCopy[]> {
    const result = await this.query<StorageObjectCopy>(
      `
      SELECT * FROM storage_object_copies
      WHERE clip_id = $1
      ORDER BY updated_at DESC
      `,
      [clipId]
    );

    return result.rows;
  }

  async updateStatus(
    id: string,
    status: StorageObjectCopyStatus,
    params: { checksum?: string | null; size_bytes?: number | null; verified_at?: string | null } = {}
  ): Promise<StorageObjectCopy | null> {
    const result = await this.query<StorageObjectCopy>(
      `
      UPDATE storage_object_copies
      SET
        copy_status = $1,
        checksum = COALESCE($2, checksum),
        size_bytes = COALESCE($3, size_bytes),
        verified_at = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [status, params.checksum ?? null, params.size_bytes ?? null, params.verified_at ?? null, id]
    );

    return result.rows[0] ?? null;
  }
}
