import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { ChildProcessByStdio } from 'node:child_process';
import type { SegmentContainer } from '../config.js';
import type { RecordingCameraSource } from '../db/recording-engine-store.js';
import type { Logger } from '../logger.js';

export interface RecordingSessionContract {
  readonly cameraId: string;
  readonly inputUrl: string;
  readonly outputPattern: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function buildFfmpegArgs(options: {
  camera: RecordingCameraSource;
  outputPattern: string;
  segmentDurationSeconds: number;
  container: SegmentContainer;
}): string[] {
  const args = ['-hide_banner', '-loglevel', 'warning'];

  if (options.camera.protocol === 'rtsp' || options.camera.protocol === 'onvif') {
    args.push('-rtsp_transport', 'tcp');
  }

  args.push(
    '-fflags',
    '+genpts',
    '-use_wallclock_as_timestamps',
    '1',
    '-i',
    options.camera.input_url,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c',
    'copy',
    '-f',
    'segment',
    '-segment_time',
    String(options.segmentDurationSeconds),
    '-segment_atclocktime',
    '1',
    '-reset_timestamps',
    '1',
    '-strftime',
    '1',
    '-segment_format',
    options.container === 'mkv' ? 'matroska' : 'mp4'
  );

  if (options.container === 'mp4') {
    args.push('-segment_format_options', 'movflags=+faststart');
  }

  args.push(options.outputPattern);
  return args;
}

export class FfmpegRecordingSession
  extends EventEmitter
  implements RecordingSessionContract
{
  readonly cameraId: string;
  readonly inputUrl: string;
  readonly outputPattern: string;

  private readonly ffmpegPath: string;
  private readonly args: string[];
  private readonly logger: Logger;
  private readonly shutdownGraceMs: number;
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private stopping = false;

  constructor(options: {
    ffmpegPath: string;
    camera: RecordingCameraSource;
    outputPattern: string;
    segmentDurationSeconds: number;
    container: SegmentContainer;
    shutdownGraceMs: number;
    logger: Logger;
  }) {
    super();
    this.cameraId = options.camera.id;
    this.inputUrl = options.camera.input_url;
    this.outputPattern = options.outputPattern;
    this.ffmpegPath = options.ffmpegPath;
    this.args = buildFfmpegArgs({
      camera: options.camera,
      outputPattern: options.outputPattern,
      segmentDurationSeconds: options.segmentDurationSeconds,
      container: options.container,
    });
    this.logger = options.logger;
    this.shutdownGraceMs = options.shutdownGraceMs;
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    await mkdir(dirname(this.outputPattern), { recursive: true });
    this.stopping = false;
    const child = spawn(this.ffmpegPath, this.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.process = child;

    const stderr = createInterface({ input: child.stderr });
    stderr.on('line', (line) => {
      this.logger.warn('ffmpeg stderr', { camera_id: this.cameraId, line });
    });

    child.on('close', (code, signal) => {
      this.logger.warn('ffmpeg session exited', {
        camera_id: this.cameraId,
        code,
        signal,
        expected: this.stopping,
      });
      this.process = null;
      this.emit('exit', { code, signal, expected: this.stopping });
    });

    child.on('error', (error) => {
      this.logger.error('ffmpeg session error', {
        camera_id: this.cameraId,
        error: error.message,
      });
    });
  }

  async stop(): Promise<void> {
    const activeProcess = this.process;
    if (!activeProcess) {
      return;
    }

    this.stopping = true;
    activeProcess.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, this.shutdownGraceMs);

      activeProcess.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
