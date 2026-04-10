import { type Pool } from 'pg';
import { BaseRepository, type PaginatedResult, type PaginationOptions } from './base-repository';

export type RecordingMode = 'continuous' | 'motion' | 'event' | 'manual';

export interface Recording {
  id: string;
  camera_id: string;
  start_time: string;
  end_time: string | null;
  file_path: string | null;
  file_size: number | null;
  recording_mode: RecordingMode;
  created_at: string;
}

export class RecordingRepository extends BaseRepository<Recording> {
  constructor(pool: Pool) {
    super(pool, 'recordings');
  }

  async findByCameraId(
    cameraId: string,
    pagination: PaginationOptions = {},
    range?: { start_from?: string; start_to?: string }
  ): Promise<PaginatedResult<Recording>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;
    const values: unknown[] = [cameraId];
    const where: string[] = ['camera_id = $1'];

    if (range?.start_from) {
      values.push(range.start_from);
      where.push(`start_time >= $${values.length}`);
    }

    if (range?.start_to) {
      values.push(range.start_to);
      where.push(`start_time <= $${values.length}`);
    }

    const whereClause = where.join(' AND ');
    const countResult = await this.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM recordings WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    values.push(limit, offset);
    const result = await this.query<Recording>(
      `
      SELECT * FROM recordings
      WHERE ${whereClause}
      ORDER BY start_time DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }
}
