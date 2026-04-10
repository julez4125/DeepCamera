import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type PolicyArmedState = 'armed' | 'disarmed' | 'partial';

export interface Policy {
  id: string;
  tenant_id: string;
  site_id: string | null;
  name: string;
  conditions: Record<string, unknown>;
  schedule: Record<string, unknown>;
  severity_rules: Record<string, unknown>;
  enabled: boolean;
  armed_state: PolicyArmedState;
  created_at: string;
  updated_at: string;
}

export class PolicyRepository extends BaseRepository<Policy> {
  constructor(pool: Pool) {
    super(pool, 'policies');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Policy>> {
    return this.findAll({ tenant_id: tenantId }, pagination);
  }

  async findBySiteId(
    siteId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Policy>> {
    return this.findAll({ site_id: siteId }, pagination);
  }
}
