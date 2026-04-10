import { describe, expect, it } from 'vitest';
import {
  normalizeRelativePath,
  resolveMountedShareDestinationPath,
  resolveMountedShareRoot,
  resolveS3StagingLocation,
  safeResolveWithinRoot,
} from '../engine/storage/mount-paths.js';

describe('mount path helpers', () => {
  it('normalizes relative paths before joining', () => {
    expect(normalizeRelativePath('/tenant-a//site-a/../camera-1/segment.mp4')).toBe(
      'tenant-a/site-a/../camera-1/segment.mp4'
    );
  });

  it('resolves mounted share roots from explicit mount_path configuration', () => {
    const root = resolveMountedShareRoot({
      id: 'target-1',
      tenant_id: 'tenant-1',
      name: 'Archive Share',
      target_type: 'smb',
      config: {
        mount_path: '/mnt/archive',
      },
    });

    expect(root).toBe('/mnt/archive');
  });

  it('resolves mounted share destinations safely inside the mount root', () => {
    const destination = resolveMountedShareDestinationPath(
      {
        id: 'target-1',
        tenant_id: 'tenant-1',
        name: 'Archive Share',
        target_type: 'nfs',
        config: {
          mount_path: '/mnt/archive',
        },
      },
      'tenant-1/site-1/camera-1/segment.mp4'
    );

    expect(destination).toBe('/mnt/archive/tenant-1/site-1/camera-1/segment.mp4');
  });

  it('rejects path traversal outside the root', () => {
    expect(() => safeResolveWithinRoot('/mnt/archive', '../escape.mp4')).toThrow(
      /escapes storage root/
    );
  });

  it('builds local s3 staging locations with manifests', () => {
    const location = resolveS3StagingLocation(
      {
        id: 'target-1',
        tenant_id: 'tenant-1',
        name: 'S3 Archive',
        target_type: 's3',
        config: {
          bucket: 'deepcamera-archive',
          prefix: 'tenant-a',
        },
      },
      'tenant-a/site-a/camera-1/segment.mp4'
    );

    expect(location.filePath).toContain('.data/s3-replication/deepcamera-archive/tenant-a/');
    expect(location.manifestPath).toMatch(/segment\.mp4\.manifest\.json$/);
  });
});
