import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecordingCameraSource } from '../db/recording-engine-store.js';
import {
  buildRecoveryBackupManifest,
  buildRecoveryReadinessSummary,
  buildReplayableJobSnapshots,
  simulateRestoreDrill,
} from '../engine/recovery/recovery-coordinator.js';

const createdRoots: string[] = [];

describe('recovery coordinator', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('builds a recovery manifest and restore drill from settled recordings', async () => {
    const root = join(tmpdir(), `ainvr-recovery-${randomUUID()}`);
    const restoreRoot = join(root, 'restore');
    createdRoots.push(root);

    const readyCamera: RecordingCameraSource = {
      id: 'camera-1',
      tenant_id: 'tenant-1',
      site_id: 'site-1',
      name: 'Front Door',
      protocol: 'rtsp',
      status: 'unknown',
      input_url: 'rtsp://camera/front-door',
    };

    const emptyCamera: RecordingCameraSource = {
      id: 'camera-2',
      tenant_id: 'tenant-1',
      site_id: 'site-1',
      name: 'Loading Bay',
      protocol: 'rtsp',
      status: 'unknown',
      input_url: 'rtsp://camera/loading-bay',
    };

    const cameraDirectory = join(root, 'tenant-1', 'site-1', 'front-door-camera-1');
    await mkdir(cameraDirectory, { recursive: true });

    const settledSegment = join(cameraDirectory, 'front-door-20260409T101500Z.mp4');
    await writeFile(settledSegment, 'segment-data');
    const settledAt = new Date(Date.now() - 60_000);
    await utimes(settledSegment, settledAt, settledAt);

    const manifest = await buildRecoveryBackupManifest({
      recordingsRoot: root,
      segmentContainer: 'mp4',
      settleMs: 1,
      cameras: [readyCamera, emptyCamera],
    });

    expect(manifest.totals).toMatchObject({
      cameras: 2,
      ready: 1,
      degraded: 0,
      empty: 1,
      segments: 1,
    });

    const readySnapshot = manifest.cameras.find((camera) => camera.camera_id === readyCamera.id);
    expect(readySnapshot?.status).toBe('ready');
    expect(readySnapshot?.latest_segment?.relative_path).toBe(
      join('tenant-1', 'site-1', 'front-door-camera-1', 'front-door-20260409T101500Z.mp4')
    );

    const snapshots = buildReplayableJobSnapshots(manifest, restoreRoot);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.find((snapshot) => snapshot.camera_id === readyCamera.id)?.actions).toEqual([
      {
        source_path: settledSegment,
        destination_path: join(
          restoreRoot,
          'tenant-1',
          'site-1',
          'front-door-camera-1',
          'front-door-20260409T101500Z.mp4'
        ),
        file_size: 'segment-data'.length,
      },
    ]);

    const drill = simulateRestoreDrill(manifest, restoreRoot);
    expect(drill.state).toBe('warn');
    expect(drill.ready_camera_count).toBe(1);
    expect(drill.empty_camera_count).toBe(1);
    expect(drill.issues.some((issue) => issue.code === 'camera-empty')).toBe(true);
  });

  it('marks a camera degraded when the directory contains unsettled or invalid segments', async () => {
    const root = join(tmpdir(), `ainvr-recovery-${randomUUID()}`);
    createdRoots.push(root);

    const camera: RecordingCameraSource = {
      id: 'camera-3',
      tenant_id: 'tenant-2',
      site_id: 'site-2',
      name: 'Warehouse',
      protocol: 'rtsp',
      status: 'unknown',
      input_url: 'rtsp://camera/warehouse',
    };

    const cameraDirectory = join(root, 'tenant-2', 'site-2', 'warehouse-camera-3');
    await mkdir(cameraDirectory, { recursive: true });

    const settledSegment = join(cameraDirectory, 'warehouse-20260409T101500Z.mp4');
    await writeFile(settledSegment, 'settled-data');
    const settledAt = new Date(Date.now() - 60_000);
    await utimes(settledSegment, settledAt, settledAt);

    const pendingSegment = join(cameraDirectory, 'warehouse-20260409T111500Z.mp4');
    await writeFile(pendingSegment, 'pending-data');

    const invalidSegment = join(cameraDirectory, 'broken-name.mp4');
    await writeFile(invalidSegment, 'broken-data');
    await utimes(invalidSegment, settledAt, settledAt);

    const summary = await buildRecoveryReadinessSummary({
      recordingsRoot: root,
      segmentContainer: 'mp4',
      settleMs: 10_000,
      cameras: [camera],
      restoreRoot: join(root, 'drill'),
    });

    expect(summary.manifest.cameras[0]?.status).toBe('degraded');
    expect(summary.manifest.cameras[0]?.candidate_file_count).toBe(3);
    expect(summary.manifest.cameras[0]?.segment_count).toBe(1);
    expect(summary.manifest.cameras[0]?.warnings.length).toBe(2);
    expect(summary.drill.state).toBe('warn');
    expect(summary.drill.snapshots[0]?.actions).toHaveLength(1);
  });
});
