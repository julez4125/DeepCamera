import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ReplicationFailureInput,
  ReplicationSuccessInput,
  ReplicationWorkItem,
  ReplicationWorkerStoreContract,
} from '../engine/storage/replication-worker-store.js';
import { StorageReplicationWorker } from '../engine/storage/replication-worker.js';
import { createLogger } from '../logger.js';
import { readFile } from 'node:fs/promises';

const createdRoots: string[] = [];

class FakeStore implements ReplicationWorkerStoreContract {
  readonly successes: ReplicationSuccessInput[] = [];
  readonly failures: ReplicationFailureInput[] = [];
  private readonly items: ReplicationWorkItem[];
  private claimed = false;

  constructor(items: ReplicationWorkItem[]) {
    this.items = items;
  }

  async connect(): Promise<void> {}

  async claimPendingJobs(): Promise<ReplicationWorkItem[]> {
    if (this.claimed) {
      return [];
    }

    this.claimed = true;
    return this.items;
  }

  async finalizeSuccessfulJob(input: ReplicationSuccessInput): Promise<void> {
    this.successes.push(input);
  }

  async finalizeFailedJob(input: ReplicationFailureInput): Promise<void> {
    this.failures.push(input);
  }

  async close(): Promise<void> {}
}

describe('StorageReplicationWorker', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('replicates mounted-share jobs into the resolved mount path', async () => {
    const root = join(tmpdir(), `ainvr-replication-${randomUUID()}`);
    createdRoots.push(root);

    const sourcePath = join(root, 'source', 'segment.mp4');
    const destinationRoot = join(root, 'mount');
    const destinationPath = join('tenant-1', 'site-1', 'camera-1', 'segment.mp4');
    await mkdir(join(root, 'source'), { recursive: true });
    await writeFile(sourcePath, 'segment-data');
    const settledAt = new Date(Date.now() - 60_000);
    await utimes(sourcePath, settledAt, settledAt);

    const store = new FakeStore([
      {
        job: {
          id: 'job-1',
          tenant_id: 'tenant-1',
          storage_target_id: 'target-1',
          object_copy_id: null,
          source_path: sourcePath,
          destination_path: destinationPath,
          status: 'pending',
          attempts: 0,
          bytes_total: 12,
          bytes_transferred: 0,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        target: {
          id: 'target-1',
          tenant_id: 'tenant-1',
          name: 'Archive Share',
          target_type: 'smb',
          status: 'unknown',
          config: {
            mount_path: destinationRoot,
          },
          capabilities: {},
        },
      },
    ]);

    const worker = new StorageReplicationWorker({
      store,
      logger: createLogger('test', 'error'),
      autoConnect: false,
    });

    const processed = await worker.tick();
    expect(processed).toBe(1);
    expect(store.successes).toHaveLength(1);
    expect(store.failures).toHaveLength(0);
    expect(await readFile(join(destinationRoot, destinationPath), 'utf8')).toBe('segment-data');
  });

  it('writes a local s3 manifest and transitions the job to succeeded', async () => {
    const root = join(tmpdir(), `ainvr-replication-${randomUUID()}`);
    createdRoots.push(root);

    const sourcePath = join(root, 'source', 'segment.mp4');
    await mkdir(join(root, 'source'), { recursive: true });
    await writeFile(sourcePath, 's3-payload');

    const store = new FakeStore([
      {
        job: {
          id: 'job-2',
          tenant_id: 'tenant-1',
          storage_target_id: 'target-2',
          object_copy_id: null,
          source_path: sourcePath,
          destination_path: 'tenant-1/site-1/camera-1/segment.mp4',
          status: 'pending',
          attempts: 0,
          bytes_total: 10,
          bytes_transferred: 0,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        target: {
          id: 'target-2',
          tenant_id: 'tenant-1',
          name: 'S3 Archive',
          target_type: 's3',
          status: 'unknown',
          config: {
            bucket: 'deepcamera-archive',
            prefix: 'tenant-1',
          },
          capabilities: {},
        },
      },
    ]);

    const worker = new StorageReplicationWorker({
      store,
      logger: createLogger('test', 'error'),
      env: {
        AINVR_S3_STAGING_ROOT: join(root, 's3'),
      },
      autoConnect: false,
    });

    const processed = await worker.tick();
    expect(processed).toBe(1);
    expect(store.successes).toHaveLength(1);

    const manifestPath = join(
      root,
      's3',
      'deepcamera-archive',
      'tenant-1',
      'tenant-1/site-1/camera-1/segment.mp4.manifest.json'
    );
    expect(await readFile(manifestPath, 'utf8')).toContain('"replication_job_id": "job-2"');
  });

  it('marks failed jobs as failed when the source file is missing', async () => {
    const store = new FakeStore([
      {
        job: {
          id: 'job-3',
          tenant_id: 'tenant-1',
          storage_target_id: 'target-3',
          object_copy_id: null,
          source_path: '/missing/source.mp4',
          destination_path: 'tenant-1/site-1/camera-1/source.mp4',
          status: 'pending',
          attempts: 0,
          bytes_total: 0,
          bytes_transferred: 0,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        target: {
          id: 'target-3',
          tenant_id: 'tenant-1',
          name: 'Archive Share',
          target_type: 'nfs',
          status: 'unknown',
          config: {
            mount_path: '/tmp/does-not-matter',
          },
          capabilities: {},
        },
      },
    ]);

    const worker = new StorageReplicationWorker({
      store,
      logger: createLogger('test', 'error'),
      autoConnect: false,
    });

    const processed = await worker.tick();
    expect(processed).toBe(1);
    expect(store.successes).toHaveLength(0);
    expect(store.failures).toHaveLength(1);
    expect(store.failures[0]?.errorMessage).toMatch(/ENOENT|missing/i);
  });
});
