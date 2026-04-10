import { resolve } from 'node:path';

export type SegmentContainer = 'mp4' | 'mkv';

export interface RecordingEngineConfig {
  databaseUrl: string;
  ffmpegPath: string;
  recordingsRoot: string;
  segmentContainer: SegmentContainer;
  segmentDurationSeconds: number;
  scanIntervalMs: number;
  segmentSettleMs: number;
  shutdownGraceMs: number;
}

function readInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readContainer(): SegmentContainer {
  return process.env['AINVR_RECORDING_CONTAINER'] === 'mkv' ? 'mkv' : 'mp4';
}

export function loadConfig(): RecordingEngineConfig {
  return {
    databaseUrl:
      process.env['DATABASE_URL'] || 'postgresql://ainvr:ainvr_dev@localhost:5432/ainvr',
    ffmpegPath: process.env['AINVR_FFMPEG_PATH'] || 'ffmpeg',
    recordingsRoot: resolve(process.cwd(), process.env['AINVR_RECORDINGS_ROOT'] || '.data/recordings'),
    segmentContainer: readContainer(),
    segmentDurationSeconds: readInteger('AINVR_SEGMENT_DURATION_SECONDS', 300),
    scanIntervalMs: readInteger('AINVR_RECORDING_SCAN_INTERVAL_MS', 5000),
    segmentSettleMs: readInteger('AINVR_SEGMENT_SETTLE_MS', 10000),
    shutdownGraceMs: readInteger('AINVR_RECORDING_SHUTDOWN_GRACE_MS', 15000),
  };
}
