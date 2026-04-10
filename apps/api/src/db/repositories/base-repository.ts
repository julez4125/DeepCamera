import { Pool, type QueryResult, type QueryResultRow } from 'pg';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Base repository class providing common CRUD operations
 */
export abstract class BaseRepository<T extends QueryResultRow> {
  protected pool: Pool;
  protected tableName: string;
  protected primaryKey: string = 'id';

  constructor(pool: Pool, tableName: string) {
    this.pool = pool;
    this.tableName = tableName;
  }

  /**
   * Find a single record by ID
   */
  async findById(id: string): Promise<T | null> {
    const result = await this.pool.query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Find all records with optional filters and pagination
   */
  async findAll(
    filters: Record<string, unknown> = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<T>> {
    const limit = pagination.limit || 100;
    const offset = pagination.offset || 0;

    // Build WHERE clause from filters
    const whereConditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        whereConditions.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const countResult = await this.pool.query<{ count: string }>(countQuery, values);
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Get paginated data
    const dataQuery = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    values.push(limit, offset);

    const result = await this.pool.query<T>(dataQuery, values);

    return {
      data: result.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
      throw new Error('No data provided for insert');
    }

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.pool.query<T>(query, values);
    return result.rows[0]!;
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data);

    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), id];

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE ${this.primaryKey} = $${keys.length + 1}
      RETURNING *
    `;

    const result = await this.pool.query<T>(query, values);
    return result.rows[0] || null;
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Count records with optional filters
   */
  async count(filters: Record<string, unknown> = {}): Promise<number> {
    const whereConditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        whereConditions.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const query = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;

    const result = await this.pool.query<{ count: string }>(query, values);
    return parseInt(result.rows[0]!.count, 10);
  }

  /**
   * Execute a raw query (for advanced use cases)
   */
  protected async query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[]
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(sql, values);
  }
}
