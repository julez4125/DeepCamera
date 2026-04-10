import type { RecordingEngineConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import {
  createReplicationAdapter,
  type ReplicationAdapter,
  type ReplicationJobLike,
  type StorageTargetLike,
} from './replication-adapters.js';
import {
  PostgresReplicationWorkerStore,
  type ReplicationFailureInput,
  type ReplicationSuccessInput,
  type ReplicationWorkItem,
  type ReplicationWorkerStoreContract,
} from './replication-worker-store.js';

export type ReplicationAdapterFactory = (target: StorageTargetLike) => ReplicationAdapter;

export class StorageReplicationWorker {
  private readonly store: ReplicationWorkerStoreContract;
  private readonly logger: Logger;
  private readonly adapterFactory: ReplicationAdapterFactory;
  private readonly batchSize: number;
  private readonly intervalMs: number;
  private readonly autoConnect: boolean;
  private readonly env: NodeJS.ProcessEnv;
  private loopHandle: NodeJS.Timeout | null = null;
  private tickInFlight = false;
  private stopRequested = false;

  constructor(options: {
    databaseUrl?: string;
    store?: ReplicationWorkerStoreContract;
    logger: Logger;
    config?: Pick<RecordingEngineConfig, 'scanIntervalMs'>;
    batchSize?: number;
    intervalMs?: number;
    env?: NodeJS.ProcessEnv;
    adapterFactory?: ReplicationAdapterFactory;
    autoConnect?: boolean;
  }) {
    this.env = options.env ?? process.env;
    this.store =
      options.store ?? new PostgresReplicationWorkerStore(options.databaseUrl ?? 'postgresql://localhost');
    this.logger = options.logger;
    this.adapterFactory = options.adapterFactory ?? ((target) => createReplicationAdapter(target, this.env));
    this.batchSize = options.batchSize ?? 8;
    this.intervalMs = options.intervalMs ?? options.config?.scanIntervalMs ?? 5000;
    this.autoConnect = options.autoConnect ?? true;
  }

  async start(): Promise<void> {
    this.stopRequested = false;
    if (this.autoConnect) {
      await this.store.connect();
    }

    await this.tick();
    this.loopHandle = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    this.stopRequested = true;

    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }

    while (this.tickInFlight) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    await this.store.close();
  }

  async tick(): Promise<number> {
    if (this.stopRequested || this.tickInFlight) {
      return 0;
    }

    this.tickInFlight = true;
    try {
      const workItems = await this.store.claimPendingJobs(this.batchSize);
      let processed = 0;

      for (const item of workItems) {
        await this.processWorkItem(item);
        processed += 1;
      }

      return processed;
    } finally {
      this.tickInFlight = false;
    }
  }

  private async processWorkItem(workItem: ReplicationWorkItem): Promise<void> {
    const adapter = this.adapterFactory(workItem.target);

    try {
      const result = await adapter.replicate(workItem.job as ReplicationJobLike, workItem.target);
      await this.store.finalizeSuccessfulJob({
        jobId: workItem.job.id,
        tenantId: workItem.job.tenant_id,
        targetId: workItem.job.storage_target_id,
        objectPath: workItem.job.destination_path,
        checksum: result.checksum,
        bytesTransferred: result.bytes_transferred,
        verifiedAt: result.verified_at,
      } as ReplicationSuccessInput);

      this.logger.info('storage replication succeeded', {
        job_id: workItem.job.id,
        storage_target_id: workItem.job.storage_target_id,
        storage_location: result.storage_location,
        bytes_transferred: result.bytes_transferred,
        checksum: result.checksum,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown replication failure';
      await this.store.finalizeFailedJob({
        jobId: workItem.job.id,
        tenantId: workItem.job.tenant_id,
        targetId: workItem.job.storage_target_id,
        objectPath: workItem.job.destination_path,
        bytesTransferred: 0,
        errorMessage: message,
      } as ReplicationFailureInput);

      this.logger.error('storage replication failed', {
        job_id: workItem.job.id,
        storage_target_id: workItem.job.storage_target_id,
        error: message,
      });
    }
  }
}
