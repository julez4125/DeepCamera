import { Pool } from 'pg';

export type ReplicationJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type StorageTargetStatus = 'unknown' | 'healthy' | 'degraded' | 'unreachable';
export type StorageTargetType = 's3' | 'smb' | 'nfs' | 'local';

export interface ReplicationTargetRecord {
  id: string;
  tenant_id: string;
  name: string;
  target_type: StorageTargetType;
  status: StorageTargetStatus;
  config: Record<string, unknown>;
  capabilities: Record<string, unknown>;
}

export interface ReplicationJobRecord {
  id: string;
  tenant_id: string;
  storage_target_id: string;
  object_copy_id: string | null;
  source_path: string;
  destination_path: string;
  status: ReplicationJobStatus;
  attempts: number;
  bytes_total: number;
  bytes_transferred: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReplicationWorkItem {
  job: ReplicationJobRecord;
  target: ReplicationTargetRecord;
}

export interface ReplicationSuccessInput {
  jobId: string;
  tenantId: string;
  targetId: string;
  objectPath: string;
  checksum: string;
  bytesTransferred: number;
  verifiedAt: string;
}

export interface ReplicationFailureInput {
  jobId: string;
  tenantId: string;
  targetId: string;
  objectPath: string;
  bytesTransferred: number;
  errorMessage: string;
}

export interface ReplicationWorkerStoreContract {
  connect(): Promise<void>;
  claimPendingJobs(limit: number): Promise<ReplicationWorkItem[]>;
  finalizeSuccessfulJob(input: ReplicationSuccessInput): Promise<void>;
  finalizeFailedJob(input: ReplicationFailureInput): Promise<void>;
  close(): Promise<void>;
}

interface ClaimedReplicationJobRow extends ReplicationJobRecord {
  target_name: string;
  target_type: StorageTargetType;
  target_status: StorageTargetStatus;
  target_config: Record<string, unknown>;
  target_capabilities: Record<string, unknown>;
}

export class PostgresReplicationWorkerStore implements ReplicationWorkerStoreContract {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  async claimPendingJobs(limit: number): Promise<ReplicationWorkItem[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ClaimedReplicationJobRow>(
        `
        WITH next_jobs AS (
          SELECT jobs.id
          FROM storage_replication_jobs AS jobs
          WHERE jobs.status = 'pending'
          ORDER BY jobs.created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE storage_replication_jobs AS jobs
        SET
          status = 'running',
          attempts = jobs.attempts + 1,
          bytes_transferred = 0,
          last_error = NULL,
          updated_at = NOW()
        FROM next_jobs, storage_targets AS targets
        WHERE jobs.id = next_jobs.id
          AND targets.id = jobs.storage_target_id
        RETURNING
          jobs.id,
          jobs.tenant_id,
          jobs.storage_target_id,
          jobs.object_copy_id,
          jobs.source_path,
          jobs.destination_path,
          jobs.status,
          jobs.attempts,
          jobs.bytes_total,
          jobs.bytes_transferred,
          jobs.last_error,
          jobs.created_at,
          jobs.updated_at,
          targets.name AS target_name,
          targets.target_type,
          targets.status AS target_status,
          targets.config AS target_config,
          targets.capabilities AS target_capabilities
        `,
        [limit]
      );
      await client.query('COMMIT');

      return result.rows.map((row) => ({
        job: {
          id: row.id,
          tenant_id: row.tenant_id,
          storage_target_id: row.storage_target_id,
          object_copy_id: row.object_copy_id,
          source_path: row.source_path,
          destination_path: row.destination_path,
          status: row.status,
          attempts: row.attempts,
          bytes_total: row.bytes_total,
          bytes_transferred: row.bytes_transferred,
          last_error: row.last_error,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        target: {
          id: row.storage_target_id,
          tenant_id: row.tenant_id,
          name: row.target_name,
          target_type: row.target_type,
          status: row.target_status,
          config: row.target_config,
          capabilities: row.target_capabilities,
        },
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeSuccessfulJob(input: ReplicationSuccessInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const copyResult = await client.query<{ id: string }>(
        `
        INSERT INTO storage_object_copies (
          tenant_id,
          storage_target_id,
          object_path,
          copy_status,
          checksum,
          size_bytes,
          verified_at
        )
        VALUES ($1, $2, $3, 'replicated', $4, $5, $6)
        RETURNING id
        `,
        [
          input.tenantId,
          input.targetId,
          input.objectPath,
          input.checksum,
          input.bytesTransferred,
          input.verifiedAt,
        ]
      );

      await client.query(
        `
        UPDATE storage_replication_jobs
        SET
          status = 'succeeded',
          bytes_transferred = $2,
          last_error = NULL,
          object_copy_id = $3,
          updated_at = NOW()
        WHERE id = $1
        `,
        [input.jobId, input.bytesTransferred, copyResult.rows[0]!.id]
      );

      await client.query(
        `
        UPDATE storage_targets
        SET status = 'healthy', last_error = NULL, last_checked_at = NOW(), updated_at = NOW()
        WHERE id = $1
        `,
        [input.targetId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeFailedJob(input: ReplicationFailureInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const copyResult = await client.query<{ id: string }>(
        `
        INSERT INTO storage_object_copies (
          tenant_id,
          storage_target_id,
          object_path,
          copy_status,
          size_bytes
        )
        VALUES ($1, $2, $3, 'failed', $4)
        RETURNING id
        `,
        [input.tenantId, input.targetId, input.objectPath, input.bytesTransferred]
      );

      await client.query(
        `
        UPDATE storage_replication_jobs
        SET
          status = 'failed',
          bytes_transferred = $2,
          last_error = $3,
          object_copy_id = $4,
          updated_at = NOW()
        WHERE id = $1
        `,
        [input.jobId, input.bytesTransferred, input.errorMessage, copyResult.rows[0]!.id]
      );

      await client.query(
        `
        UPDATE storage_targets
        SET status = 'degraded', last_error = $2, last_checked_at = NOW(), updated_at = NOW()
        WHERE id = $1
        `,
        [input.targetId, input.errorMessage]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
