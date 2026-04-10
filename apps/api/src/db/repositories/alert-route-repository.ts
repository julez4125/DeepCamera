import { type Pool } from 'pg';
import { BaseRepository } from './base-repository';

export type AlertChannel = 'webhook' | 'mqtt' | 'telegram' | 'discord' | 'slack' | 'email';

export interface AlertRoute {
  id: string;
  policy_id: string;
  channel: AlertChannel;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export class AlertRouteRepository extends BaseRepository<AlertRoute> {
  constructor(pool: Pool) {
    super(pool, 'alert_routes');
  }

  async findByPolicyId(policyId: string): Promise<AlertRoute[]> {
    const result = await this.query<AlertRoute>(
      `
      SELECT * FROM alert_routes
      WHERE policy_id = $1
      ORDER BY created_at ASC
      `,
      [policyId]
    );

    return result.rows;
  }
}
