import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import type { SegmentContainer } from '../../config.js';
import type { RecordingCameraSource } from '../../db/recording-engine-store.js';
import { getCameraRecordingDirectory, getSegmentExtension, parseSegmentStart, slugifySegmentPart } from '../storage-paths.js';

export type RecoveryReadinessState = 'ready' | 'degraded' | 'empty';
export type RecoveryDrillState = 'pass' | 'warn' | 'fail';
export type RecoveryIssueLevel = 'info' | 'warning' | 'critical';

export interface RecoveryIssue {
  level: RecoveryIssueLevel;
  code: string;
  message: string;
  camera_id: string | null;
  camera_name: string | null;
}

export interface RecoverySegmentSnapshot {
  file_path: string;
  relative_path: string;
  start_time: string;
  end_time: string;
  file_size: number;
}

export interface RecoveryCameraManifest {
  camera_id: string;
  tenant_id: string;
  site_id: string;
  camera_name: string;
  camera_directory: string;
  status: RecoveryReadinessState;
  candidate_file_count: number;
  segment_count: number;
  total_bytes: number;
  warnings: string[];
  latest_segment: RecoverySegmentSnapshot | null;
  segments: RecoverySegmentSnapshot[];
}

export interface RecoveryBackupManifest {
  schema_version: '1';
  generated_at: string;
  recordings_root: string;
  segment_container: SegmentContainer;
  totals: {
    cameras: number;
    ready: number;
    degraded: number;
    empty: number;
    segments: number;
    bytes: number;
  };
  cameras: RecoveryCameraManifest[];
}

export interface RecoveryRestoreAction {
  source_path: string;
  destination_path: string;
  file_size: number;
}

export interface RecoveryReplayableJobSnapshot {
  snapshot_id: string;
  camera_id: string;
  tenant_id: string;
  site_id: string;
  camera_name: string;
  restore_root: string;
  restore_directory: string;
  recoverable: boolean;
  segment_count: number;
  estimated_bytes: number;
  actions: RecoveryRestoreAction[];
}

export interface RecoveryRestoreDrill {
  state: RecoveryDrillState;
  restore_root: string;
  ready_camera_count: number;
  degraded_camera_count: number;
  empty_camera_count: number;
  issues: RecoveryIssue[];
  snapshots: RecoveryReplayableJobSnapshot[];
}

export interface RecoveryReadinessSummary {
  manifest: RecoveryBackupManifest;
  drill: RecoveryRestoreDrill;
}

export interface RecoveryReadinessInput {
  recordingsRoot: string;
  segmentContainer: SegmentContainer;
  settleMs: number;
  cameras: RecordingCameraSource[];
  now?: Date;
  restoreRoot?: string;
}

function buildRestoreDirectory(
  restoreRoot: string,
  camera: Pick<RecordingCameraSource, 'tenant_id' | 'site_id' | 'id' | 'name'>
): string {
  const cameraSlug = slugifySegmentPart(camera.name) || camera.id;
  return join(restoreRoot, camera.tenant_id, camera.site_id, `${cameraSlug}-${camera.id}`);
}

async function scanCameraRecoveryManifest(options: {
  recordingsRoot: string;
  segmentContainer: SegmentContainer;
  settleMs: number;
  camera: RecordingCameraSource;
  now: Date;
}): Promise<RecoveryCameraManifest> {
  const cameraDirectory = getCameraRecordingDirectory(options.recordingsRoot, options.camera);
  const extension = `.${getSegmentExtension(options.segmentContainer)}`;
  const warnings: string[] = [];
  const segments: RecoverySegmentSnapshot[] = [];
  let candidateFileCount = 0;
  let fileNames: string[] = [];

  try {
    fileNames = await readdir(cameraDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        camera_id: options.camera.id,
        tenant_id: options.camera.tenant_id,
        site_id: options.camera.site_id,
        camera_name: options.camera.name,
        camera_directory: cameraDirectory,
        status: 'empty',
        candidate_file_count: 0,
        segment_count: 0,
        total_bytes: 0,
        warnings: ['camera recording directory is missing'],
        latest_segment: null,
        segments: [],
      };
    }

    throw error;
  }

  fileNames.sort((left, right) => left.localeCompare(right));

  for (const fileName of fileNames) {
    if (extname(fileName) !== extension) {
      continue;
    }

    candidateFileCount += 1;
    const filePath = join(cameraDirectory, fileName);
    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        warnings.push(`segment disappeared before it could be scanned: ${fileName}`);
        continue;
      }

      throw error;
    }

    if (!fileStats.isFile()) {
      warnings.push(`segment candidate is not a file: ${fileName}`);
      continue;
    }

    const startedAt = parseSegmentStart(filePath);
    if (!startedAt) {
      warnings.push(`segment filename is not recoverable: ${fileName}`);
      continue;
    }

    if (options.now.getTime() - fileStats.mtimeMs < options.settleMs) {
      warnings.push(`segment is still settling and was skipped: ${fileName}`);
      continue;
    }

    const startTimeMs = Date.parse(startedAt);
    const endTimeMs = Number.isNaN(startTimeMs)
      ? fileStats.mtimeMs
      : Math.max(fileStats.mtimeMs, startTimeMs + 1000);

    segments.push({
      file_path: filePath,
      relative_path: relative(options.recordingsRoot, filePath),
      start_time: startedAt,
      end_time: new Date(endTimeMs).toISOString(),
      file_size: fileStats.size,
    });
  }

  const totalBytes = segments.reduce((sum, segment) => sum + segment.file_size, 0);
  const latestSegment = segments.at(-1) ?? null;

  return {
    camera_id: options.camera.id,
    tenant_id: options.camera.tenant_id,
    site_id: options.camera.site_id,
    camera_name: options.camera.name,
    camera_directory: cameraDirectory,
    status: segments.length > 0 ? (warnings.length > 0 ? 'degraded' : 'ready') : warnings.length > 0 ? 'degraded' : 'empty',
    candidate_file_count: candidateFileCount,
    segment_count: segments.length,
    total_bytes: totalBytes,
    warnings,
    latest_segment: latestSegment,
    segments,
  };
}

export async function buildRecoveryBackupManifest(
  input: RecoveryReadinessInput
): Promise<RecoveryBackupManifest> {
  const now = input.now ?? new Date();
  const scans = await Promise.all(
    input.cameras.map((camera) =>
      scanCameraRecoveryManifest({
        recordingsRoot: input.recordingsRoot,
        segmentContainer: input.segmentContainer,
        settleMs: input.settleMs,
        camera,
        now,
      })
    )
  );

  scans.sort((left, right) => left.camera_id.localeCompare(right.camera_id));

  const totals = scans.reduce(
    (accumulator, camera) => {
      accumulator.cameras += 1;
      accumulator.segments += camera.segment_count;
      accumulator.bytes += camera.total_bytes;
      accumulator[camera.status] += 1;
      return accumulator;
    },
    {
      cameras: 0,
      ready: 0,
      degraded: 0,
      empty: 0,
      segments: 0,
      bytes: 0,
    }
  );

  return {
    schema_version: '1',
    generated_at: now.toISOString(),
    recordings_root: input.recordingsRoot,
    segment_container: input.segmentContainer,
    totals,
    cameras: scans,
  };
}

export function buildReplayableJobSnapshots(
  manifest: RecoveryBackupManifest,
  restoreRoot = resolve(process.cwd(), '.data/recovery-drills')
): RecoveryReplayableJobSnapshot[] {
  return manifest.cameras.map((camera) => {
    const restoreDirectory = buildRestoreDirectory(restoreRoot, {
      tenant_id: camera.tenant_id,
      site_id: camera.site_id,
      id: camera.camera_id,
      name: camera.camera_name,
    });

    const actions = camera.segments.map<RecoveryRestoreAction>((segment) => ({
      source_path: segment.file_path,
      destination_path: join(restoreDirectory, basename(segment.file_path)),
      file_size: segment.file_size,
    }));

    const latestToken = camera.latest_segment?.start_time ?? 'no-segment';
    return {
      snapshot_id: `recovery-${camera.camera_id}-${camera.segment_count}-${latestToken}`,
      camera_id: camera.camera_id,
      tenant_id: camera.tenant_id,
      site_id: camera.site_id,
      camera_name: camera.camera_name,
      restore_root: restoreRoot,
      restore_directory: restoreDirectory,
      recoverable: camera.segment_count > 0,
      segment_count: camera.segment_count,
      estimated_bytes: camera.total_bytes,
      actions,
    };
  });
}

export function simulateRestoreDrill(
  manifest: RecoveryBackupManifest,
  restoreRoot = resolve(process.cwd(), '.data/recovery-drills')
): RecoveryRestoreDrill {
  const snapshots = buildReplayableJobSnapshots(manifest, restoreRoot);
  const issues: RecoveryIssue[] = [];

  for (const camera of manifest.cameras) {
    if (camera.status === 'empty') {
      issues.push({
        level: 'warning',
        code: 'camera-empty',
        camera_id: camera.camera_id,
        camera_name: camera.camera_name,
        message: 'No settled recording segments were available for a restore drill.',
      });
      continue;
    }

    if (camera.warnings.length > 0) {
      issues.push({
        level: 'warning',
        code: 'camera-degraded',
        camera_id: camera.camera_id,
        camera_name: camera.camera_name,
        message: camera.warnings.join(' '),
      });
    }
  }

  if (manifest.totals.cameras === 0) {
    issues.push({
      level: 'critical',
      code: 'no-cameras',
      camera_id: null,
      camera_name: null,
      message: 'No recording cameras were available to validate recovery readiness.',
    });
  }

  const recoverableSnapshots = snapshots.filter((snapshot) => snapshot.recoverable);
  const warningCount = issues.filter((issue) => issue.level === 'warning').length;
  const criticalCount = issues.filter((issue) => issue.level === 'critical').length;
  const state: RecoveryDrillState =
    criticalCount > 0 || recoverableSnapshots.length === 0
      ? 'fail'
      : warningCount > 0
        ? 'warn'
        : 'pass';

  return {
    state,
    restore_root: restoreRoot,
    ready_camera_count: manifest.totals.ready,
    degraded_camera_count: manifest.totals.degraded,
    empty_camera_count: manifest.totals.empty,
    issues,
    snapshots,
  };
}

export async function buildRecoveryReadinessSummary(
  input: RecoveryReadinessInput
): Promise<RecoveryReadinessSummary> {
  const manifest = await buildRecoveryBackupManifest(input);
  const restoreRoot = input.restoreRoot ?? resolve(process.cwd(), '.data/recovery-drills');
  const drill = simulateRestoreDrill(manifest, restoreRoot);
  return { manifest, drill };
}

export async function ensureRecoveryDrillRoot(restoreRoot = resolve(process.cwd(), '.data/recovery-drills')): Promise<string> {
  await mkdir(restoreRoot, { recursive: true });
  return restoreRoot;
}
