import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export type IncidentStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'closed';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type EscalationState = 'none' | 'scheduled' | 'escalated' | 'critical';

export interface IncidentEvidenceReference {
  kind: 'snapshot' | 'clip' | 'recording';
  snapshot_id: string | null;
  clip_id: string | null;
  recording_id: string | null;
  path: string;
  preview_url?: string;
  playback_url?: string;
}

export interface Incident {
  id: string;
  tenant_id: string;
  site_id: string;
  severity: IncidentSeverity;
  confidence: number;
  category: string;
  summary: string;
  status: IncidentStatus;
  camera_ids: string[];
  timeline_start: string;
  timeline_end: string;
  policy_hits: Record<string, any>;
  escalation_state: EscalationState;
  linked_event_ids: string[];
  evidence_references: IncidentEvidenceReference[];
  dedupe_count: number;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export class IncidentRepository extends BaseRepository<Incident> {
  constructor(pool: Pool) {
    super(pool, 'incidents');
  }

  /**
   * Find incidents by status for a specific tenant
   */
  async findByStatus(
    tenantId: string,
    status: IncidentStatus,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<Incident>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Get total count
    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM incidents WHERE tenant_id = $1 AND status = $2',
      [tenantId, status]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const result = await this.query<Incident>(
      `
      SELECT * FROM incidents
      WHERE tenant_id = $1 AND status = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [tenantId, status, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Acknowledge an incident
   */
  async acknowledge(id: string, userId: string): Promise<Incident | null> {
    const result = await this.query<Incident>(
      `
      UPDATE incidents
      SET status = $1, acknowledged_by = $2, acknowledged_at = NOW(), updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      ['acknowledged', userId, id]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Escalate an incident
   */
  async escalate(id: string): Promise<Incident | null> {
    const result = await this.query<Incident>(
      `
      UPDATE incidents
      SET escalation_state = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      ['escalated', id]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Close an incident
   */
  async close(id: string): Promise<Incident | null> {
    const result = await this.query<Incident>(
      `
      UPDATE incidents
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      ['closed', id]
    );

    return result.rows[0] ?? null;
  }
}
