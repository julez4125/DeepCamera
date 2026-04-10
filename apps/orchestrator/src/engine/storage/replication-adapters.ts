import { copyFileAndFingerprint, writeJsonArtifact } from './file-artifacts.js';
import {
  resolveMountedShareDestinationPath,
  resolveS3StagingLocation,
  type StorageTargetLike,
} from './mount-paths.js';

export interface ReplicationJobLike {
  id: string;
  tenant_id: string;
  storage_target_id: string;
  source_path: string;
  destination_path: string;
  bytes_total: number;
}

export interface ReplicationResult {
  storage_location: string;
  checksum: string;
  bytes_transferred: number;
  verified_at: string;
  manifest_path?: string;
}

export interface ReplicationAdapter {
  replicate(job: ReplicationJobLike, target: StorageTargetLike): Promise<ReplicationResult>;
}

class MountedShareReplicationAdapter implements ReplicationAdapter {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async replicate(job: ReplicationJobLike, target: StorageTargetLike): Promise<ReplicationResult> {
    const storageLocation = resolveMountedShareDestinationPath(target, job.destination_path, this.env);
    const fingerprint = await copyFileAndFingerprint(job.source_path, storageLocation);

    return {
      storage_location: storageLocation,
      checksum: fingerprint.checksum,
      bytes_transferred: fingerprint.bytes,
      verified_at: new Date().toISOString(),
    };
  }
}

class LocalS3ReplicationAdapter implements ReplicationAdapter {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async replicate(job: ReplicationJobLike, target: StorageTargetLike): Promise<ReplicationResult> {
    const stagingLocation = resolveS3StagingLocation(target, job.destination_path, this.env);
    const fingerprint = await copyFileAndFingerprint(job.source_path, stagingLocation.filePath);
    const verifiedAt = new Date().toISOString();

    await writeJsonArtifact(stagingLocation.manifestPath, {
      replication_job_id: job.id,
      tenant_id: job.tenant_id,
      storage_target_id: job.storage_target_id,
      bucket: stagingLocation.bucket,
      object_key: stagingLocation.objectKey,
      source_path: job.source_path,
      destination_path: job.destination_path,
      storage_location: stagingLocation.filePath,
      bytes_transferred: fingerprint.bytes,
      checksum: fingerprint.checksum,
      verified_at: verifiedAt,
    });

    return {
      storage_location: stagingLocation.filePath,
      checksum: fingerprint.checksum,
      bytes_transferred: fingerprint.bytes,
      verified_at: verifiedAt,
      manifest_path: stagingLocation.manifestPath,
    };
  }
}

export function createReplicationAdapter(
  target: StorageTargetLike,
  env: NodeJS.ProcessEnv = process.env
): ReplicationAdapter {
  switch (target.target_type) {
    case 's3':
      return new LocalS3ReplicationAdapter(env);
    case 'smb':
    case 'nfs':
    case 'local':
    default:
      return new MountedShareReplicationAdapter(env);
  }
}

export type { StorageTargetLike } from './mount-paths.js';
export { MountedShareReplicationAdapter, LocalS3ReplicationAdapter };
