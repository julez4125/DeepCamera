import { type Pool } from 'pg';
import { BaseRepository, type PaginatedResult, type PaginationOptions } from './base-repository';

export interface Clip {
  id: string;
  camera_id: string;
  recording_id: string | null;
  start_time: string;
  end_time: string;
  file_path: string;
  file_size: number | null;
  thumbnail_path: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class ClipRepository extends BaseRepository<Clip> {
  constructor(pool: Pool) {
    super(pool, 'clips');
  }

  async findByCameraId(
    cameraId: string,
    pagination: PaginationOptions = {},
    range?: { start_from?: string; start_to?: string }
  ): Promise<PaginatedResult<Clip>> {
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
      `SELECT COUNT(*) as count FROM clips WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    values.push(limit, offset);
    const result = await this.query<Clip>(
      `
      SELECT * FROM clips
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
