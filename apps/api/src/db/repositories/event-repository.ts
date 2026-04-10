import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface EventRecord {
  id: string;
  camera_id: string;
  site_id: string;
  tenant_id: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, unknown>;
  severity: EventSeverity;
  correlation_id: string;
  created_at: string;
}

export class EventRepository extends BaseRepository<EventRecord> {
  constructor(pool: Pool) {
    super(pool, 'events');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {},
    filters: {
      camera_id?: string;
      event_type?: string;
      severity?: EventSeverity;
      date_from?: string;
      date_to?: string;
    } = {}
  ): Promise<PaginatedResult<EventRecord>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;
    const values: unknown[] = [tenantId];
    const whereConditions = ['tenant_id = $1'];

    if (filters.camera_id) {
      values.push(filters.camera_id);
      whereConditions.push(`camera_id = $${values.length}`);
    }
    if (filters.event_type) {
      values.push(filters.event_type);
      whereConditions.push(`event_type = $${values.length}`);
    }
    if (filters.severity) {
      values.push(filters.severity);
      whereConditions.push(`severity = $${values.length}`);
    }
    if (filters.date_from) {
      values.push(filters.date_from);
      whereConditions.push(`timestamp >= $${values.length}`);
    }
    if (filters.date_to) {
      values.push(filters.date_to);
      whereConditions.push(`timestamp <= $${values.length}`);
    }

    const whereClause = whereConditions.join(' AND ');

    const countResult = await this.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM events WHERE ${whereClause}`,
      values
    );
    const total = Number.parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<EventRecord>(
      `
      SELECT * FROM events
      WHERE ${whereClause}
      ORDER BY timestamp DESC, created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }
}
