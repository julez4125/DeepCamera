import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type CameraStatus = 'online' | 'offline' | 'degraded' | 'unknown';
export type CameraProtocol = 'rtsp' | 'onvif' | 'http' | 'hls';

export interface Camera {
  id: string;
  site_id: string;
  name: string;
  stream_url: string;
  protocol: CameraProtocol;
  status: CameraStatus;
  detection_enabled: boolean;
  recording_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class CameraRepository extends BaseRepository<Camera> {
  constructor(pool: Pool) {
    super(pool, 'cameras');
  }

  /**
   * Find all cameras for a specific site
   */
  async findBySiteId(
    siteId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Camera>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Get total count
    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM cameras WHERE site_id = $1',
      [siteId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const result = await this.query<Camera>(
      `
      SELECT * FROM cameras
      WHERE site_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [siteId, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Update camera status
   */
  async updateStatus(id: string, status: CameraStatus): Promise<Camera | null> {
    const result = await this.query<Camera>(
      `
      UPDATE cameras
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    return result.rows[0] ?? null;
  }
}
