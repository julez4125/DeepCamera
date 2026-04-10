import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type SnapshotSource = 'camera' | 'stream' | 'recording' | 'clip' | 'detection';

export interface Snapshot {
  id: string;
  camera_id: string;
  recording_id: string | null;
  clip_id: string | null;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  checksum: string | null;
  captured_at: string;
  source: SnapshotSource;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class SnapshotRepository extends BaseRepository<Snapshot> {
  constructor(pool: Pool) {
    super(pool, 'snapshots');
  }

  async findByCameraId(
    cameraId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Snapshot>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM snapshots WHERE camera_id = $1',
      [cameraId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<Snapshot>(
      `
      SELECT * FROM snapshots
      WHERE camera_id = $1
      ORDER BY captured_at DESC
      LIMIT $2 OFFSET $3
      `,
      [cameraId, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }

  async findLatestByCameraId(cameraId: string): Promise<Snapshot | null> {
    const result = await this.query<Snapshot>(
      `
      SELECT * FROM snapshots
      WHERE camera_id = $1
      ORDER BY captured_at DESC
      LIMIT 1
      `,
      [cameraId]
    );

    return result.rows[0] || null;
  }
}
