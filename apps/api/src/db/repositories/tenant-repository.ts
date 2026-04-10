import { type Pool } from 'pg';
import { BaseRepository } from './base-repository';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export class TenantRepository extends BaseRepository<Tenant> {
  constructor(pool: Pool) {
    super(pool, 'tenants');
  }

  /**
   * Find a tenant by slug
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await this.query<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1',
      [slug]
    );

    return result.rows[0] ?? null;
  }
}
