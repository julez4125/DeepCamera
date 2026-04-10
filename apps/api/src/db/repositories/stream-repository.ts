import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type StreamType = 'main' | 'sub' | 'snapshot';

export interface Stream {
  id: string;
  camera_id: string;
  stream_type: StreamType;
  url: string;
  active: boolean;
  created_at: string;
}

export class StreamRepository extends BaseRepository<Stream> {
  constructor(pool: Pool) {
    super(pool, 'streams');
  }

  async findByCameraId(
    cameraId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Stream>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM streams WHERE camera_id = $1',
      [cameraId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<Stream>(
      `
      SELECT * FROM streams
      WHERE camera_id = $1
      ORDER BY created_at DESC
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
}
