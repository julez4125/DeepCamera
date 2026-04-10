import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { SegmentContainer } from '../config.js';
import type { RecordingCameraSource } from '../db/recording-engine-store.js';

export interface DiscoveredSegmentFile {
  file_path: string;
  start_time: string;
  end_time: string;
  file_size: number;
}

export function slugifySegmentPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function getSegmentExtension(container: SegmentContainer): string {
  return container === 'mkv' ? 'mkv' : 'mp4';
}

export function getCameraRecordingDirectory(
  recordingsRoot: string,
  camera: Pick<RecordingCameraSource, 'tenant_id' | 'site_id' | 'id' | 'name'>
): string {
  const cameraSlug = slugifySegmentPart(camera.name) || camera.id;
  return join(recordingsRoot, camera.tenant_id, camera.site_id, `${cameraSlug}-${camera.id}`);
}

export function buildSegmentPattern(
  recordingsRoot: string,
  camera: Pick<RecordingCameraSource, 'tenant_id' | 'site_id' | 'id' | 'name'>,
  container: SegmentContainer
): string {
  const extension = getSegmentExtension(container);
  const slug = slugifySegmentPart(camera.name) || camera.id;
  return join(
    getCameraRecordingDirectory(recordingsRoot, camera),
    `${slug}-%Y%m%dT%H%M%SZ.${extension}`
  );
}

export function parseSegmentStart(filePath: string): string | null {
  const filename = basename(filePath);
  const match = filename.match(/-(\d{8}T\d{6}Z)\.[a-z0-9]+$/i);
  if (!match?.[1]) {
    return null;
  }

  const compact = match[1];
  const year = compact.slice(0, 4);
  const month = compact.slice(4, 6);
  const day = compact.slice(6, 8);
  const hours = compact.slice(9, 11);
  const minutes = compact.slice(11, 13);
  const seconds = compact.slice(13, 15);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

export async function discoverCompletedSegments(options: {
  recordingsRoot: string;
  camera: Pick<RecordingCameraSource, 'tenant_id' | 'site_id' | 'id' | 'name'>;
  container: SegmentContainer;
  settleMs: number;
  now?: Date;
}): Promise<DiscoveredSegmentFile[]> {
  const cameraDirectory = getCameraRecordingDirectory(options.recordingsRoot, options.camera);
  const extension = `.${getSegmentExtension(options.container)}`;
  const nowMs = (options.now ?? new Date()).getTime();

  let files: string[] = [];
  try {
    files = await readdir(cameraDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const discovered: DiscoveredSegmentFile[] = [];

  for (const file of files) {
    if (extname(file) !== extension) {
      continue;
    }

    const filePath = join(cameraDirectory, file);
    const startedAt = parseSegmentStart(filePath);
    if (!startedAt) {
      continue;
    }

    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      continue;
    }

    if (nowMs - fileStats.mtimeMs < options.settleMs) {
      continue;
    }

    const startTimeMs = Date.parse(startedAt);
    const endTimeMs = Number.isNaN(startTimeMs)
      ? fileStats.mtimeMs
      : Math.max(fileStats.mtimeMs, startTimeMs + 1000);

    discovered.push({
      file_path: filePath,
      start_time: startedAt,
      end_time: new Date(endTimeMs).toISOString(),
      file_size: fileStats.size,
    });
  }

  discovered.sort((left, right) => left.start_time.localeCompare(right.start_time));
  return discovered;
}

export function buildReplicationDestinationPath(
  assignmentPathPrefix: string | null,
  camera: Pick<RecordingCameraSource, 'tenant_id' | 'site_id' | 'id' | 'name'>,
  filePath: string
): string {
  const prefix = assignmentPathPrefix || join(camera.tenant_id, camera.site_id, camera.id);
  return join(prefix, basename(filePath));
}
