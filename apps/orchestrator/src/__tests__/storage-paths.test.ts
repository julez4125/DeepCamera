import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReplicationDestinationPath,
  buildSegmentPattern,
  discoverCompletedSegments,
  parseSegmentStart,
} from '../engine/storage-paths.js';

const createdRoots: string[] = [];

describe('storage-path helpers', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('builds a stable segment pattern for a camera', () => {
    const pattern = buildSegmentPattern(
      '/recordings',
      {
        tenant_id: 'tenant-1',
        site_id: 'site-1',
        id: 'camera-1',
        name: 'Front Door',
      },
      'mp4'
    );

    expect(pattern).toContain('/recordings/tenant-1/site-1/front-door-camera-1/');
    expect(pattern).toContain('front-door-%Y%m%dT%H%M%SZ.mp4');
  });

  it('parses compact timestamps from segment names', () => {
    expect(parseSegmentStart('/tmp/front-door-20260409T101530Z.mp4')).toBe(
      '2026-04-09T10:15:30Z'
    );
  });

  it('discovers completed segment files once they are settled', async () => {
    const root = join(tmpdir(), `ainvr-orchestrator-${randomUUID()}`);
    createdRoots.push(root);
    const cameraDirectory = join(root, 'tenant-1', 'site-1', 'front-door-camera-1');
    await mkdir(cameraDirectory, { recursive: true });
    const filePath = join(cameraDirectory, 'front-door-20260409T101500Z.mp4');
    await writeFile(filePath, 'segment-payload');

    const segments = await discoverCompletedSegments({
      recordingsRoot: root,
      camera: {
        tenant_id: 'tenant-1',
        site_id: 'site-1',
        id: 'camera-1',
        name: 'Front Door',
      },
      container: 'mp4',
      settleMs: 1,
      now: new Date(Date.now() + 50),
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]?.file_path).toBe(filePath);
    expect(segments[0]?.start_time).toBe('2026-04-09T10:15:00Z');
    expect(segments[0]?.file_size).toBeGreaterThan(0);
  });

  it('builds replication destinations with assignment prefixes', () => {
    const destination = buildReplicationDestinationPath(
      'archive/site-a',
      {
        tenant_id: 'tenant-1',
        site_id: 'site-1',
        id: 'camera-1',
        name: 'Front Door',
      },
      '/var/lib/recordings/front-door-20260409T101500Z.mp4'
    );

    expect(destination).toBe('archive/site-a/front-door-20260409T101500Z.mp4');
  });
});
