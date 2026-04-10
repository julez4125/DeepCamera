import { type Pool } from 'pg';
import { BaseRepository, type PaginationOptions, type PaginatedResult } from './base-repository';

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor(pool: Pool) {
    super(pool, 'audit_logs');
  }

  /**
   * Log an audit event
   */
  async log(
    tenantId: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string
  ): Promise<AuditLog> {
    const result = await this.query<AuditLog>(
      `
      INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        tenantId,
        userId,
        action,
        resourceType,
        resourceId || null,
        JSON.stringify(details || {}),
        ipAddress || null,
      ]
    );

    return result.rows[0]!;
  }

  /**
   * Find all audit logs for a specific tenant
   */
  async findByTenantId(
    tenantId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<AuditLog>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Get total count
    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const result = await this.query<AuditLog>(
      `
      SELECT * FROM audit_logs
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

  /**
   * Find audit logs by user ID
   */
  async findByUserId(
    userId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<AuditLog>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Get total count
    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const result = await this.query<AuditLog>(
      `
      SELECT * FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Find audit logs by action
   */
  async findByAction(
    action: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<AuditLog>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Get total count
    const countResult = await this.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE action = $1',
      [action]
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const result = await this.query<AuditLog>(
      `
      SELECT * FROM audit_logs
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [action, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }
}
