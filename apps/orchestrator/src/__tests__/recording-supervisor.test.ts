import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CameraStatus,
  RecordingCameraSource,
  RecordingEngineStoreContract,
  RecordingRow,
} from '../db/recording-engine-store.js';
import { RecordingSupervisor } from '../engine/recording-supervisor.js';
import { createLogger } from '../logger.js';

class FakeSession {
  readonly cameraId: string;
  readonly inputUrl: string;
  readonly outputPattern: string;
  started = false;
  stopped = false;

  constructor(camera: RecordingCameraSource, outputPattern: string) {
    this.cameraId = camera.id;
    this.inputUrl = camera.input_url;
    this.outputPattern = outputPattern;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  isRunning(): boolean {
    return this.started && !this.stopped;
  }
}

const createdRoots: string[] = [];

describe('RecordingSupervisor', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('starts sessions and indexes completed recording segments', async () => {
    const root = join(tmpdir(), `ainvr-supervisor-${randomUUID()}`);
    createdRoots.push(root);

    const camera: RecordingCameraSource = {
      id: 'camera-1',
      tenant_id: 'tenant-1',
      site_id: 'site-1',
      name: 'Front Door',
      protocol: 'rtsp',
      status: 'unknown',
      input_url: 'rtsp://camera/front-door',
    };

    const cameraDirectory = join(root, 'tenant-1', 'site-1', 'front-door-camera-1');
    await mkdir(cameraDirectory, { recursive: true });
    const segmentPath = join(cameraDirectory, 'front-door-20260409T101500Z.mp4');
    await writeFile(segmentPath, 'segment-a');
    const settledAt = new Date(Date.now() - 60_000);
    await utimes(segmentPath, settledAt, settledAt);

    const statuses: CameraStatus[] = [];
    const recordings: RecordingRow[] = [];
    const queuedDestinations: string[] = [];

    const store: RecordingEngineStoreContract = {
      listRecordingCameras: vi.fn().mockResolvedValue([camera]),
      updateCameraStatus: vi.fn().mockImplementation(async (_cameraId, status) => {
        statuses.push(status);
      }),
      findRecordingByPath: vi.fn().mockResolvedValue(null),
      createRecording: vi.fn().mockImplementation(async (segment) => {
        const recording: RecordingRow = {
          id: 'recording-1',
          created_at: new Date().toISOString(),
          ...segment,
        };
        recordings.push(recording);
        return recording;
      }),
      listReplicationAssignments: vi.fn().mockResolvedValue([
        {
          tenant_id: 'tenant-1',
          storage_target_id: 'target-1',
          target_type: 's3',
          path_prefix: 'archive/front-door',
          replication_enabled: true,
          priority: 100,
        },
      ]),
      enqueueReplicationJob: vi.fn().mockImplementation(async (job) => {
        queuedDestinations.push(job.destination_path);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const supervisor = new RecordingSupervisor({
      store,
      config: {
        databaseUrl: 'postgresql://unused',
        ffmpegPath: 'ffmpeg',
        recordingsRoot: root,
        segmentContainer: 'mp4',
        segmentDurationSeconds: 300,
        scanIntervalMs: 1000,
        segmentSettleMs: 1,
        shutdownGraceMs: 1000,
      },
      logger: createLogger('test', 'error'),
      sessionFactory: (activeCamera, outputPattern) => new FakeSession(activeCamera, outputPattern),
    });

    await supervisor.tick();

    expect(supervisor.getActiveSessionCount()).toBe(1);
    expect(statuses).toContain('online');
    expect(recordings).toHaveLength(1);
    expect(recordings[0]?.camera_id).toBe(camera.id);
    expect(queuedDestinations).toEqual([
      'archive/front-door/front-door-20260409T101500Z.mp4',
    ]);
  });
});
