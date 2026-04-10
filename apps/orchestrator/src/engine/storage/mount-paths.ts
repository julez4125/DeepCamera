import { resolve, sep } from 'node:path';
import { slugifySegmentPart } from '../storage-paths.js';

export type StorageTargetType = 's3' | 'smb' | 'nfs' | 'local';

export interface StorageTargetLike {
  id: string;
  tenant_id: string;
  name: string;
  target_type: StorageTargetType;
  config: Record<string, unknown>;
}

function stringConfig(config: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function normalizeRelativePath(input: string): string {
  return input
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part.length > 0 && part !== '.')
    .join('/');
}

export function safeResolveWithinRoot(root: string, relativePath: string): string {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(normalizedRoot, normalizeRelativePath(relativePath));

  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`Resolved path escapes storage root: ${relativePath}`);
  }

  return normalizedPath;
}

export function resolveMountedShareRoot(
  target: StorageTargetLike,
  env: NodeJS.ProcessEnv = process.env
): string {
  const config = target.config ?? {};
  const explicitRoot = stringConfig(config, [
    'mount_path',
    'mount_root',
    'local_path',
    'base_path',
    'root_path',
    'path',
  ]);

  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  const share = stringConfig(config, ['share_path', 'share', 'remote_path']);
  const host = stringConfig(config, ['host', 'server', 'hostname']);
  const mountRoot = resolve(env['AINVR_MOUNT_ROOT'] ?? '.data/mounted-shares');

  if (target.target_type === 'local') {
    return resolve(
      env['AINVR_LOCAL_STORAGE_ROOT'] ?? mountRoot,
      slugifySegmentPart(target.name) || target.id,
      target.id
    );
  }

  if (host || share) {
    return resolve(
      mountRoot,
      slugifySegmentPart(host ?? target.name) || target.id,
      slugifySegmentPart(share ?? target.id) || target.id
    );
  }

  throw new Error(
    `Storage target ${target.id} is missing a mount_path, local_path, base_path, or share configuration`
  );
}

export function resolveMountedShareDestinationPath(
  target: StorageTargetLike,
  destinationPath: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return safeResolveWithinRoot(resolveMountedShareRoot(target, env), destinationPath);
}

export function resolveS3StagingLocation(
  target: StorageTargetLike,
  destinationPath: string,
  env: NodeJS.ProcessEnv = process.env
): {
  root: string;
  bucket: string;
  objectKey: string;
  filePath: string;
  manifestPath: string;
} {
  const config = target.config ?? {};
  const bucket = stringConfig(config, ['bucket', 'bucket_name']);

  if (!bucket) {
    throw new Error(`Storage target ${target.id} is missing bucket configuration`);
  }

  const prefix = normalizeRelativePath(
    stringConfig(config, ['prefix', 'path_prefix', 'object_prefix']) ?? ''
  );
  const root = resolve(env['AINVR_S3_STAGING_ROOT'] ?? '.data/s3-replication', bucket, prefix);
  const objectKey = normalizeRelativePath(destinationPath);
  const filePath = safeResolveWithinRoot(root, objectKey);

  return {
    root,
    bucket,
    objectKey,
    filePath,
    manifestPath: `${filePath}.manifest.json`,
  };
}
