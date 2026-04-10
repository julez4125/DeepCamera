import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type SearchSourceType = 'incident' | 'event' | 'clip';

export interface SearchDocument {
  id: string;
  tenant_id: string;
  site_id: string;
  source_type: SearchSourceType;
  source_id: string;
  incident_id: string | null;
  event_id: string | null;
  clip_id: string | null;
  camera_ids: string[];
  severity: string | null;
  title: string;
  summary: string;
  occurred_at: string;
  keywords: string[];
  semantic_terms: string[];
  matched_terms: string[];
  score: number;
  vlm_summary: string | null;
  suspicious_context: string[];
  created_at: string;
  updated_at: string;
}

export class SearchDocumentRepository extends BaseRepository<SearchDocument> {
  constructor(pool: Pool) {
    super(pool, 'search_documents');
  }

  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {},
    filters: {
      site_id?: string;
      camera_id?: string;
      severity?: string;
      source_type?: SearchSourceType;
    } = {}
  ): Promise<PaginatedResult<SearchDocument>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;
    const values: unknown[] = [tenantId];
    const whereConditions = ['tenant_id = $1'];

    if (filters.site_id) {
      values.push(filters.site_id);
      whereConditions.push(`site_id = $${values.length}`);
    }
    if (filters.camera_id) {
      values.push(filters.camera_id);
      whereConditions.push(`$${values.length} = ANY(camera_ids)`);
    }
    if (filters.severity) {
      values.push(filters.severity);
      whereConditions.push(`severity = $${values.length}`);
    }
    if (filters.source_type) {
      values.push(filters.source_type);
      whereConditions.push(`source_type = $${values.length}`);
    }

    const whereClause = whereConditions.join(' AND ');
    const countResult = await this.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM search_documents WHERE ${whereClause}`,
      values
    );
    const total = Number.parseInt(countResult.rows[0]!.count, 10);

    const result = await this.query<SearchDocument>(
      `
      SELECT * FROM search_documents
      WHERE ${whereClause}
      ORDER BY occurred_at DESC, updated_at DESC
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
    sourceType: SearchSourceType,
    sourceId: string
  ): Promise<SearchDocument | null> {
    const result = await this.query<SearchDocument>(
      `
      SELECT * FROM search_documents
      WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3
      LIMIT 1
      `,
      [tenantId, sourceType, sourceId]
    );

    return result.rows[0] ?? null;
  }
}
