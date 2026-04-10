import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type ZoneType = 'entry' | 'restricted' | 'restricted_zone';

export interface Zone {
  id: string;
  site_id: string;
  name: string;
  polygon: Record<string, unknown> | null;
  zone_type: ZoneType;
  created_at: string;
  updated_at: string;
}

export class ZoneRepository extends BaseRepository<Zone> {
  constructor(pool: Pool) {
    super(pool, 'zones');
  }

  async findBySiteId(
    siteId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Zone>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM zones WHERE site_id = $1',
      [siteId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<Zone>(
      `
      SELECT * FROM zones
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
}
