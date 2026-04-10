import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type EnrichmentSourceType = 'incident' | 'event';
export type EnrichmentStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type EnrichmentModel = 'vlm-fallback-v1';

export interface EnrichmentRecord {
  id: string;
  tenant_id: string;
  source_type: EnrichmentSourceType;
  source_id: string;
  incident_id: string | null;
  event_id: string | null;
  clip_id: string | null;
  snapshot_id: string | null;
  recording_id: string | null;
  status: EnrichmentStatus;
  model: EnrichmentModel;
  summary: string | null;
  suspicious_context: string[];
  keywords: string[];
  semantic_terms: string[];
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class EnrichmentRepository extends BaseRepository<EnrichmentRecord> {
  constructor(pool: Pool) {
    super(pool, 'enrichments');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {},
    filters: {
      status?: EnrichmentStatus;
      incident_id?: string;
      event_id?: string;
      source_type?: EnrichmentSourceType;
    } = {}
  ): Promise<PaginatedResult<EnrichmentRecord>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;
    const values: unknown[] = [tenantId];
    const whereConditions = ['tenant_id = $1'];

    if (filters.status) {
      values.push(filters.status);
      whereConditions.push(`status = $${values.length}`);
    }
    if (filters.incident_id) {
      values.push(filters.incident_id);
      whereConditions.push(`incident_id = $${values.length}`);
    }
    if (filters.event_id) {
      values.push(filters.event_id);
      whereConditions.push(`event_id = $${values.length}`);
    }
    if (filters.source_type) {
      values.push(filters.source_type);
      whereConditions.push(`source_type = $${values.length}`);
    }

    const whereClause = whereConditions.join(' AND ');
    const countResult = await this.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM enrichments WHERE ${whereClause}`,
      values
    );
    const total = Number.parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<EnrichmentRecord>(
      `
      SELECT * FROM enrichments
      WHERE ${whereClause}
      ORDER BY queued_at DESC, created_at DESC
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

  async findBySource(
    tenantId: string,
    sourceType: EnrichmentSourceType,
    sourceId: string
  ): Promise<EnrichmentRecord | null> {
    const result = await this.query<EnrichmentRecord>(
      `
      SELECT * FROM enrichments
      WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [tenantId, sourceType, sourceId]
    );

    return result.rows[0] ?? null;
  }

  async findByIncidentId(incidentId: string): Promise<EnrichmentRecord[]> {
    const result = await this.query<EnrichmentRecord>(
      `
      SELECT * FROM enrichments
      WHERE incident_id = $1
      ORDER BY queued_at DESC, created_at DESC
      `,
      [incidentId]
    );

    return result.rows;
  }
}
