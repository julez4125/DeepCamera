import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  Recording,
  StoragePolicyAssignment,
  StorageTarget,
} from '../db/repositories/index.js';

const execFileAsync = promisify(execFile);

export interface FinalizeClipArtifactsInput {
  clipId?: string;
  cameraId: string;
  tenantId: string;
  startTime: string;
  endTime: string;
  recordings: Recording[];
  ffmpegPath?: string;
  mediaRoot?: string;
}

export interface FinalizeClipArtifactsResult {
  clipId: string;
  filePath: string;
  thumbnailPath: string;
  manifestPath: string;
  fileSize: number;
  checksum: string;
  metadata: Record<string, unknown>;
}

export interface ReplicationPlan {
  assignment: StoragePolicyAssignment;
  target: StorageTarget;
  destinationPrefix: string;
}

function mediaRootPath(root?: string): string {
  return resolve(process.cwd(), root || '.data/media');
}

function clipDirectory(root: string, tenantId: string, cameraId: string): string {
  return join(root, 'clips', tenantId, cameraId);
}

function mountedTargetBasePath(target: StorageTarget): string | null {
  if (target.target_type !== 'local' && target.target_type !== 'smb' && target.target_type !== 'nfs') {
    return null;
  }

  const basePath =
    (target.config['base_path'] as string | undefined) ||
    (target.config['mount_path'] as string | undefined) ||
    (target.config['path'] as string | undefined);

  return basePath ? resolve(String(basePath)) : null;
}

export function buildReplicationDestinationPrefix(
  assignment: StoragePolicyAssignment,
  cameraId: string,
  clipId: string
): string {
  const configured = assignment.path_prefix?.replace(/\/+$/g, '');
  return configured || join('camera-assets', cameraId, clipId);
}

function clipDurationSeconds(startTime: string, endTime: string): number {
  return Math.max(1, Math.round((Date.parse(endTime) - Date.parse(startTime)) / 1000));
}

function overlappingRecordings(
  recordings: Recording[],
  startTime: string,
  endTime: string
): Recording[] {
  const requestedStart = Date.parse(startTime);
  const requestedEnd = Date.parse(endTime);

  return recordings
    .filter((recording) => Boolean(recording.file_path))
    .filter((recording) => {
      const recordingStart = Date.parse(recording.start_time);
      const recordingEnd = Date.parse(recording.end_time || recording.start_time);
      return recordingStart <= requestedEnd && recordingEnd >= requestedStart;
    })
    .sort((left, right) => left.start_time.localeCompare(right.start_time));
}

async function runFfmpeg(ffmpegPath: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(ffmpegPath, args);
    return true;
  } catch {
    return false;
  }
}

async function assembleWithFfmpeg(
  ffmpegPath: string,
  recordings: Recording[],
  startTime: string,
  endTime: string,
  outputPath: string
): Promise<boolean> {
  const validRecordings = recordings.filter((recording) => recording.file_path);
  if (validRecordings.length === 0) {
    return false;
  }

  if (validRecordings.length === 1) {
    const recording = validRecordings[0]!;
    const offsetStart = Math.max(
      0,
      Math.floor((Date.parse(startTime) - Date.parse(recording.start_time)) / 1000)
    );
    const duration = clipDurationSeconds(startTime, endTime);

    return runFfmpeg(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(offsetStart),
      '-i',
      recording.file_path!,
      '-t',
      String(duration),
      '-c',
      'copy',
      outputPath,
    ]);
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), 'ainvr-clip-finalizer-'));
  const concatListPath = join(tempDirectory, 'concat.txt');
  const mergedPath = join(tempDirectory, `merged${extname(outputPath) || '.mp4'}`);

  try {
    await writeFile(
      concatListPath,
      validRecordings.map((recording) => `file '${recording.file_path!.replace(/'/g, "'\\''")}'`).join('\n')
    );

    const merged = await runFfmpeg(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      mergedPath,
    ]);

    if (!merged) {
      return false;
    }

    const offsetStart = Math.max(
      0,
      Math.floor((Date.parse(startTime) - Date.parse(validRecordings[0]!.start_time)) / 1000)
    );
    const duration = clipDurationSeconds(startTime, endTime);

    return runFfmpeg(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(offsetStart),
      '-i',
      mergedPath,
      '-t',
      String(duration),
      '-c',
      'copy',
      outputPath,
    ]);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function assembleFallback(recordings: Recording[], outputPath: string): Promise<void> {
  const buffers = await Promise.all(
    recordings
      .filter((recording) => recording.file_path)
      .map(async (recording) => readFile(recording.file_path!))
  );

  await writeFile(outputPath, Buffer.concat(buffers));
}

async function generateThumbnail(
  ffmpegPath: string,
  sourcePath: string,
  thumbnailPath: string
): Promise<void> {
  const created = await runFfmpeg(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    '00:00:01',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    thumbnailPath,
  ]);

  if (!created) {
    await writeFile(thumbnailPath, `thumbnail:${basename(sourcePath)}`);
  }
}

async function sha256(filePath: string): Promise<string> {
  const fileBuffer = await readFile(filePath);
  return createHash('sha256').update(fileBuffer).digest('hex');
}

export async function finalizeClipArtifacts(
  input: FinalizeClipArtifactsInput
): Promise<FinalizeClipArtifactsResult> {
  const clipId = input.clipId || randomUUID();
  const root = mediaRootPath(input.mediaRoot);
  const directory = clipDirectory(root, input.tenantId, input.cameraId);
  const filePath = join(directory, `${clipId}.mp4`);
  const thumbnailPath = join(directory, `${clipId}.jpg`);
  const manifestPath = join(directory, `${clipId}.manifest.json`);
  const ffmpegPath = input.ffmpegPath || process.env['AINVR_FFMPEG_PATH'] || 'ffmpeg';
  const selectedRecordings = overlappingRecordings(input.recordings, input.startTime, input.endTime);

  if (selectedRecordings.length === 0) {
    throw new Error('No recordings overlap the requested clip range.');
  }

  await mkdir(directory, { recursive: true });

  const createdWithFfmpeg = await assembleWithFfmpeg(
    ffmpegPath,
    selectedRecordings,
    input.startTime,
    input.endTime,
    filePath
  );

  if (!createdWithFfmpeg) {
    await assembleFallback(selectedRecordings, filePath);
  }

  await generateThumbnail(ffmpegPath, filePath, thumbnailPath);

  const fileStats = await stat(filePath);
  const checksum = await sha256(filePath);
  const sourceRecordingIds = selectedRecordings.map((recording) => recording.id);
  const durationSeconds = clipDurationSeconds(input.startTime, input.endTime);

  const manifest = {
    clip_id: clipId,
    camera_id: input.cameraId,
    tenant_id: input.tenantId,
    source_recording_ids: sourceRecordingIds,
    start_time: input.startTime,
    end_time: input.endTime,
    file_path: filePath,
    thumbnail_path: thumbnailPath,
    checksum,
    file_size: fileStats.size,
    duration_seconds: durationSeconds,
    generated_at: new Date().toISOString(),
    assembler: createdWithFfmpeg ? 'ffmpeg' : 'fallback',
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    clipId,
    filePath,
    thumbnailPath,
    manifestPath,
    fileSize: fileStats.size,
    checksum,
    metadata: {
      duration_seconds: durationSeconds,
      source_recording_ids: sourceRecordingIds,
      source_recording_count: sourceRecordingIds.length,
      manifest_path: manifestPath,
      checksum,
      status: 'local_only',
      assembler: createdWithFfmpeg ? 'ffmpeg' : 'fallback',
    },
  };
}

export async function replicateClipArtifactsToMountedTarget(options: {
  target: StorageTarget;
  destinationPrefix: string;
  clipFilePath: string;
  thumbnailPath: string;
  manifestPath: string;
}): Promise<{ objectPath: string; checksum: string; sizeBytes: number }> {
  const basePath = mountedTargetBasePath(options.target);
  if (!basePath) {
    throw new Error(`Target ${options.target.id} is not a mounted filesystem target.`);
  }

  const destinationDirectory = join(basePath, options.destinationPrefix);
  await mkdir(destinationDirectory, { recursive: true });

  const destinationClipPath = join(destinationDirectory, basename(options.clipFilePath));
  const destinationThumbnailPath = join(destinationDirectory, basename(options.thumbnailPath));
  const destinationManifestPath = join(destinationDirectory, basename(options.manifestPath));

  await copyFile(options.clipFilePath, destinationClipPath);
  await copyFile(options.thumbnailPath, destinationThumbnailPath);
  await copyFile(options.manifestPath, destinationManifestPath);

  const fileStats = await stat(destinationClipPath);
  const checksum = await sha256(destinationClipPath);

  return {
    objectPath: destinationClipPath,
    checksum,
    sizeBytes: fileStats.size,
  };
}
