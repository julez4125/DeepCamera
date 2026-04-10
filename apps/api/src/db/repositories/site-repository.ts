import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export interface Site {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export class SiteRepository extends BaseRepository<Site> {
  constructor(pool: Pool) {
    super(pool, 'sites');
  }

  /**
   * Find all sites for a specific tenant
   */
  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Site>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Get total count
    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM sites WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const result = await this.query<Site>(
      `
      SELECT * FROM sites
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
}
