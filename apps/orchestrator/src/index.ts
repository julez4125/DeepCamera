import { loadConfig } from './config.js';
import { RecordingEngineStore } from './db/recording-engine-store.js';
import { buildRecoveryReadinessSummary } from './engine/recovery/recovery-coordinator.js';
import { RecordingSupervisor } from './engine/recording-supervisor.js';
import { createLogger } from './logger.js';

const logger = createLogger('orchestrator');

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new RecordingEngineStore(config.databaseUrl);
  await store.connect();
  const cameras = await store.listRecordingCameras();
  const recovery = await buildRecoveryReadinessSummary({
    recordingsRoot: config.recordingsRoot,
    segmentContainer: config.segmentContainer,
    settleMs: config.segmentSettleMs,
    cameras,
  });

  logger.info('recovery readiness summary', {
    camera_total: recovery.manifest.totals.cameras,
    ready_cameras: recovery.manifest.totals.ready,
    degraded_cameras: recovery.manifest.totals.degraded,
    empty_cameras: recovery.manifest.totals.empty,
    recoverable_snapshots: recovery.drill.snapshots.filter((snapshot) => snapshot.recoverable).length,
    drill_state: recovery.drill.state,
  });

  const supervisor = new RecordingSupervisor({
    store,
    config,
    logger: logger.child('recording-supervisor'),
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutting down orchestrator', { signal });
    try {
      await supervisor.stop();
      await store.close();
      process.exit(0);
    } catch (error) {
      logger.error('failed during orchestrator shutdown', {
        error: (error as Error).message,
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  logger.info('starting recording engine', {
    node_version: process.version,
    recordings_root: config.recordingsRoot,
    segment_duration_seconds: config.segmentDurationSeconds,
    segment_container: config.segmentContainer,
  });

  await supervisor.start();
  logger.info('recording engine ready');
}

void main().catch((error) => {
  logger.error('orchestrator startup failed', { error: (error as Error).message });
  process.exit(1);
});
