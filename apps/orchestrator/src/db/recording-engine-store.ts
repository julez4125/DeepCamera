import { Pool } from 'pg';

export type CameraProtocol = 'rtsp' | 'onvif' | 'http' | 'hls';
export type CameraStatus = 'online' | 'offline' | 'degraded' | 'unknown';
export type RecordingMode = 'continuous' | 'motion' | 'event' | 'manual';
export type StorageTargetType = 's3' | 'smb' | 'nfs' | 'local';

export interface RecordingCameraSource {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  protocol: CameraProtocol;
  status: CameraStatus;
  input_url: string;
}

export interface RecordingSegmentInput {
  camera_id: string;
  start_time: string;
  end_time: string;
  file_path: string;
  file_size: number;
  recording_mode: RecordingMode;
}

export interface RecordingRow extends RecordingSegmentInput {
  id: string;
  created_at: string;
}

export interface ReplicationAssignment {
  tenant_id: string;
  storage_target_id: string;
  target_type: StorageTargetType;
  path_prefix: string | null;
  replication_enabled: boolean;
  priority: number;
}

export interface ReplicationJobInput {
  tenant_id: string;
  storage_target_id: string;
  source_path: string;
  destination_path: string;
  bytes_total: number;
}

export interface RecordingEngineStoreContract {
  listRecordingCameras(): Promise<RecordingCameraSource[]>;
  updateCameraStatus(cameraId: string, status: CameraStatus): Promise<void>;
  findRecordingByPath(cameraId: string, filePath: string): Promise<RecordingRow | null>;
  createRecording(segment: RecordingSegmentInput): Promise<RecordingRow>;
  listReplicationAssignments(camera: RecordingCameraSource): Promise<ReplicationAssignment[]>;
  enqueueReplicationJob(job: ReplicationJobInput): Promise<void>;
  close(): Promise<void>;
}

export class RecordingEngineStore implements RecordingEngineStoreContract {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
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

  async listRecordingCameras(): Promise<RecordingCameraSource[]> {
    const result = await this.pool.query<RecordingCameraSource>(
      `
      SELECT
        cameras.id,
        sites.tenant_id,
        cameras.site_id,
        cameras.name,
        cameras.protocol,
        cameras.status,
        COALESCE(preferred_stream.url, cameras.stream_url) AS input_url
      FROM cameras
      INNER JOIN sites ON sites.id = cameras.site_id
      LEFT JOIN LATERAL (
        SELECT streams.url
        FROM streams
        WHERE streams.camera_id = cameras.id
        ORDER BY
          CASE WHEN streams.active THEN 0 ELSE 1 END,
          CASE WHEN streams.stream_type = 'main' THEN 0 ELSE 1 END,
          streams.created_at DESC
        LIMIT 1
      ) AS preferred_stream ON true
      WHERE cameras.recording_enabled = true
      ORDER BY cameras.created_at ASC
      `
    );

    return result.rows;
  }

  async updateCameraStatus(cameraId: string, status: CameraStatus): Promise<void> {
    await this.pool.query(
      `
      UPDATE cameras
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      `,
      [status, cameraId]
    );
  }

  async findRecordingByPath(cameraId: string, filePath: string): Promise<RecordingRow | null> {
    const result = await this.pool.query<RecordingRow>(
      `
      SELECT *
      FROM recordings
      WHERE camera_id = $1 AND file_path = $2
      LIMIT 1
      `,
      [cameraId, filePath]
    );

    return result.rows[0] ?? null;
  }

  async createRecording(segment: RecordingSegmentInput): Promise<RecordingRow> {
    const result = await this.pool.query<RecordingRow>(
      `
      INSERT INTO recordings (
        camera_id,
        start_time,
        end_time,
        file_path,
        file_size,
        recording_mode
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        segment.camera_id,
        segment.start_time,
        segment.end_time,
        segment.file_path,
        segment.file_size,
        segment.recording_mode,
      ]
    );

    return result.rows[0]!;
  }

  async listReplicationAssignments(
    camera: RecordingCameraSource
  ): Promise<ReplicationAssignment[]> {
    const result = await this.pool.query<ReplicationAssignment>(
      `
      SELECT
        policies.tenant_id,
        policies.storage_target_id,
        storage_targets.target_type,
        policies.path_prefix,
        policies.replication_enabled,
        policies.priority
      FROM camera_storage_policies AS policies
      INNER JOIN storage_targets ON storage_targets.id = policies.storage_target_id
      WHERE
        policies.tenant_id = $1
        AND (policies.camera_id = $2 OR (policies.site_id = $3 AND policies.camera_id IS NULL))
      ORDER BY
        CASE WHEN policies.camera_id = $2 THEN 0 ELSE 1 END,
        policies.priority ASC,
        policies.created_at DESC
      `,
      [camera.tenant_id, camera.id, camera.site_id]
    );

    return result.rows;
  }

  async enqueueReplicationJob(job: ReplicationJobInput): Promise<void> {
    const existing = await this.pool.query<{ id: string }>(
      `
      SELECT id
      FROM storage_replication_jobs
      WHERE storage_target_id = $1 AND source_path = $2 AND destination_path = $3
      LIMIT 1
      `,
      [job.storage_target_id, job.source_path, job.destination_path]
    );

    if (existing.rows[0]) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO storage_replication_jobs (
        tenant_id,
        storage_target_id,
        source_path,
        destination_path,
        status,
        attempts,
        bytes_total,
        bytes_transferred
      )
      VALUES ($1, $2, $3, $4, 'pending', 0, $5, 0)
      `,
      [
        job.tenant_id,
        job.storage_target_id,
        job.source_path,
        job.destination_path,
        job.bytes_total,
      ]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
