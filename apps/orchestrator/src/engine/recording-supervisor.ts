import { mkdir } from 'node:fs/promises';
import type { RecordingEngineConfig } from '../config.js';
import type {
  RecordingCameraSource,
  RecordingEngineStoreContract,
} from '../db/recording-engine-store.js';
import type { Logger } from '../logger.js';
import { FfmpegRecordingSession, type RecordingSessionContract } from './ffmpeg-session.js';
import { StorageReplicationWorker } from './storage/replication-worker.js';
import {
  buildReplicationDestinationPath,
  buildSegmentPattern,
  discoverCompletedSegments,
} from './storage-paths.js';

export type RecordingSessionFactory = (
  camera: RecordingCameraSource,
  outputPattern: string
) => RecordingSessionContract;

interface ActiveSession {
  camera: RecordingCameraSource;
  session: RecordingSessionContract;
  outputPattern: string;
}

export class RecordingSupervisor {
  private readonly store: RecordingEngineStoreContract;
  private readonly config: RecordingEngineConfig;
  private readonly logger: Logger;
  private readonly sessionFactory: RecordingSessionFactory;
  private readonly replicationWorker: StorageReplicationWorker;
  private readonly sessions = new Map<string, ActiveSession>();
  private loopHandle: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(options: {
    store: RecordingEngineStoreContract;
    config: RecordingEngineConfig;
    logger: Logger;
    sessionFactory?: RecordingSessionFactory;
  }) {
    this.store = options.store;
    this.config = options.config;
    this.logger = options.logger;
    this.replicationWorker = new StorageReplicationWorker({
      databaseUrl: this.config.databaseUrl,
      logger: this.logger.child('storage-replication-worker'),
      config: this.config,
    });
    this.sessionFactory =
      options.sessionFactory ??
      ((camera, outputPattern) => {
        const session = new FfmpegRecordingSession({
          ffmpegPath: this.config.ffmpegPath,
          camera,
          outputPattern,
          segmentDurationSeconds: this.config.segmentDurationSeconds,
          container: this.config.segmentContainer,
          shutdownGraceMs: this.config.shutdownGraceMs,
          logger: this.logger.child(camera.id),
        });

        session.on('exit', async ({ expected }: { expected: boolean }) => {
          if (expected) {
            return;
          }

          try {
            await this.store.updateCameraStatus(camera.id, 'degraded');
          } catch (error) {
            this.logger.error('failed to mark camera degraded after ffmpeg exit', {
              camera_id: camera.id,
              error: (error as Error).message,
            });
          }
        });

        return session;
      });
  }

  async start(): Promise<void> {
    await mkdir(this.config.recordingsRoot, { recursive: true });
    await this.replicationWorker.start();
    await this.tick();
    this.loopHandle = setInterval(() => {
      void this.tick();
    }, this.config.scanIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }

    await this.replicationWorker.stop();

    for (const [cameraId, active] of this.sessions) {
      await active.session.stop();
      await this.store.updateCameraStatus(cameraId, 'offline');
    }

    this.sessions.clear();
  }

  async tick(): Promise<void> {
    if (this.tickInFlight) {
      return;
    }

    this.tickInFlight = true;
    try {
      const cameras = await this.store.listRecordingCameras();
      const desiredCameraIds = new Set(cameras.map((camera) => camera.id));

      for (const camera of cameras) {
        await this.ensureSession(camera);
        await this.syncCompletedSegments(camera);
      }

      for (const [cameraId, active] of this.sessions) {
        if (desiredCameraIds.has(cameraId)) {
          continue;
        }

        await active.session.stop();
        await this.store.updateCameraStatus(cameraId, 'offline');
        this.sessions.delete(cameraId);
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private async ensureSession(camera: RecordingCameraSource): Promise<void> {
    const outputPattern = buildSegmentPattern(
      this.config.recordingsRoot,
      camera,
      this.config.segmentContainer
    );
    const existing = this.sessions.get(camera.id);

    if (
      existing &&
      existing.session.isRunning() &&
      existing.outputPattern === outputPattern &&
      existing.session.inputUrl === camera.input_url
    ) {
      return;
    }

    if (existing) {
      await existing.session.stop();
      this.sessions.delete(camera.id);
    }

    const session = this.sessionFactory(camera, outputPattern);
    await session.start();
    this.sessions.set(camera.id, { camera, session, outputPattern });
    await this.store.updateCameraStatus(camera.id, 'online');
    this.logger.info('recording session started', {
      camera_id: camera.id,
      output_pattern: outputPattern,
    });
  }

  private async syncCompletedSegments(camera: RecordingCameraSource): Promise<void> {
    const segments = await discoverCompletedSegments({
      recordingsRoot: this.config.recordingsRoot,
      camera,
      container: this.config.segmentContainer,
      settleMs: this.config.segmentSettleMs,
    });

    if (segments.length === 0) {
      return;
    }

    const assignments = await this.store.listReplicationAssignments(camera);

    for (const segment of segments) {
      const existing = await this.store.findRecordingByPath(camera.id, segment.file_path);
      if (existing) {
        continue;
      }

      const recording = await this.store.createRecording({
        camera_id: camera.id,
        start_time: segment.start_time,
        end_time: segment.end_time,
        file_path: segment.file_path,
        file_size: segment.file_size,
        recording_mode: 'continuous',
      });

      this.logger.info('recording segment indexed', {
        camera_id: camera.id,
        recording_id: recording.id,
        file_path: recording.file_path,
        bytes: recording.file_size,
      });

      for (const assignment of assignments) {
        if (!assignment.replication_enabled || assignment.target_type !== 's3') {
          continue;
        }

        await this.store.enqueueReplicationJob({
          tenant_id: assignment.tenant_id,
          storage_target_id: assignment.storage_target_id,
          source_path: segment.file_path,
          destination_path: buildReplicationDestinationPath(
            assignment.path_prefix,
            camera,
            segment.file_path
          ),
          bytes_total: segment.file_size,
        });
      }
    }
  }
}
