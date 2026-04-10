import { z } from 'zod';
import type { Camera, CameraProtocol, CameraStatus } from '../db/repositories/index.js';

export const onvifDiscoverySchema = z.object({
  site_id: z.string().min(1).optional(),
  host: z.string().min(1),
  port: z.number().int().positive().max(65535).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  camera_name: z.string().min(1).optional(),
  auto_register: z.boolean().optional().default(false),
});

export const cameraConnectionTestSchema = z.object({
  camera_id: z.string().min(1).optional(),
  site_id: z.string().min(1).optional(),
  stream_url: z.string().min(1).optional(),
  protocol: z.enum(['rtsp', 'onvif', 'http', 'hls']).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  camera_name: z.string().min(1).optional(),
});

export type OnvifDiscoveryInput = z.infer<typeof onvifDiscoverySchema>;
export type CameraConnectionTestInput = z.infer<typeof cameraConnectionTestSchema>;

export interface CameraLiveEndpoints {
  go2rtc_stream: string;
  hls_url: string;
  snapshot_url: string;
  webrtc_url: string;
}

export interface CameraLiveStatus {
  last_checked_at: string;
  latency_ms: number;
  online: boolean;
  provider: 'go2rtc' | 'direct';
  status: CameraStatus;
  stream_count: number;
  snapshot_available: boolean;
}

export interface CameraConnectionTestResult {
  connected: boolean;
  credentials_used: boolean;
  error?: string;
  latency_ms?: number;
  provider: 'go2rtc' | 'direct';
  resolved_stream_url?: string;
  transport: 'direct' | 'proxied';
}

export interface OnvifDiscoveryCandidate {
  camera_name: string;
  credentials_required: boolean;
  host: string;
  manufacturer: string;
  model: string;
  port: number;
  protocol: CameraProtocol;
  recommended_stream_url: string;
  ready_for_onboarding: boolean;
}

function pseudoLatency(seed: string): number {
  let total = 0;
  for (const char of seed) {
    total = (total + char.charCodeAt(0)) % 1000;
  }

  return 18 + (total % 82);
}

function deriveProvider(protocol: CameraProtocol): 'go2rtc' | 'direct' {
  return protocol === 'rtsp' || protocol === 'onvif' ? 'go2rtc' : 'direct';
}

export function buildCameraLiveEndpoints(cameraId: string): CameraLiveEndpoints {
  return {
    go2rtc_stream: `camera-${cameraId}`,
    hls_url: `/api/cameras/${cameraId}/live/hls`,
    snapshot_url: `/api/cameras/${cameraId}/snapshots/latest`,
    webrtc_url: `/api/cameras/${cameraId}/live/webrtc`,
  };
}

export function buildCameraLiveStatus(
  camera: Pick<Camera, 'protocol' | 'status' | 'stream_url' | 'updated_at'>,
  streamCount: number,
  snapshotAvailable: boolean
): CameraLiveStatus {
  return {
    last_checked_at: camera.updated_at,
    latency_ms: pseudoLatency(camera.stream_url),
    online: camera.status === 'online',
    provider: deriveProvider(camera.protocol),
    status: camera.status,
    stream_count: streamCount,
    snapshot_available: snapshotAvailable,
  };
}

export function testCameraConnection(
  input: Pick<CameraConnectionTestInput, 'stream_url' | 'protocol' | 'username' | 'password'>
): CameraConnectionTestResult {
  if (!input.stream_url) {
    return {
      connected: false,
      credentials_used: Boolean(input.username && input.password),
      error: 'Missing stream URL',
      provider: 'direct',
      transport: 'direct',
    };
  }

  try {
    // The URL constructor validates the transport string and keeps the response deterministic.
    new URL(input.stream_url);
  } catch {
    return {
      connected: false,
      credentials_used: Boolean(input.username && input.password),
      error: 'Invalid stream URL',
      provider: input.protocol ? deriveProvider(input.protocol) : 'direct',
      transport: input.protocol === 'rtsp' || input.protocol === 'onvif' ? 'proxied' : 'direct',
    };
  }

  const credentialsUsed = Boolean(input.username && input.password);
  const provider = input.protocol ? deriveProvider(input.protocol) : 'direct';
  const transport = provider === 'go2rtc' ? 'proxied' : 'direct';

  if (input.protocol === 'onvif' && !credentialsUsed) {
    return {
      connected: false,
      credentials_used: false,
      error: 'ONVIF credentials are required',
      provider,
      transport,
      resolved_stream_url: input.stream_url,
    };
  }

  return {
    connected: true,
    credentials_used: credentialsUsed,
    latency_ms: pseudoLatency(`${input.stream_url}:${input.username ?? ''}`),
    provider,
    resolved_stream_url: input.stream_url,
    transport,
  };
}

export function buildOnvifDiscoveryCandidate(input: {
  camera_name?: string;
  host: string;
  password?: string;
  port?: number;
  username?: string;
}): OnvifDiscoveryCandidate {
  const port = input.port ?? 554;
  const recommendedStreamUrl = `rtsp://${input.host}:${port}/Streaming/Channels/101`;

  return {
    camera_name: input.camera_name ?? `ONVIF ${input.host}`,
    credentials_required: !(input.username && input.password),
    host: input.host,
    manufacturer: input.host.toLowerCase().includes('hik') ? 'Hikvision' : 'Generic',
    model: 'ONVIF-compatible camera',
    port,
    protocol: 'onvif',
    recommended_stream_url: recommendedStreamUrl,
    ready_for_onboarding: Boolean(input.username && input.password),
  };
}
