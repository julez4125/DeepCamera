'use client';

import type React from 'react';
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildIncidentEvidencePreview,
  buildPolicyEscalationPreview,
  buildPolicyRoutes,
  buildZoneCoverageLabel,
  loadWaveCContext,
  summarizePolicyConditions,
  summarizePolicySchedule,
  summarizePolicySeverity,
  type WaveCContext,
  type WaveCEvidence,
  type WaveCOverlayKey,
  type WaveCRoute,
  type WaveCThresholdKey,
} from './wave-c-model';
import {
  loadPhase8Workspace,
  type Phase8SearchFilters,
  type Phase8SearchResult,
  type Phase8Workspace,
} from './phase-eight-model';
import {
  loadPhase9Workspace,
  type Phase9IdentityModule,
  type Phase9Workspace,
} from './phase-nine-model';

type CameraStatus = 'online' | 'degraded' | 'offline';
type ConnectivityState = 'stable' | 'reconnecting' | 'disconnected';
type StreamHealth = 'healthy' | 'warning' | 'offline';
type TimelineTab = 'timeline' | 'recordings' | 'clips';
type StorageStatus = 'local_only' | 'replicating' | 'replicated' | 'degraded' | 'missing';

type Camera = {
  id: string;
  siteId: string;
  name: string;
  site: string;
  location: string;
  status: CameraStatus;
  connectivity: ConnectivityState;
  health: StreamHealth;
  protocol: 'WebRTC' | 'HLS fallback';
  resolution: string;
  fps: number;
  latencyMs: number;
  bitrateMbps: number;
  lastMotion: string;
  snapshotAge: string;
  recording: string;
  detectionEnabled: boolean;
  recordingEnabled: boolean;
  endpoint: string;
  note: string;
  motion: string;
  streamCount: number;
};

type TimelineItem = {
  id: string;
  type: 'clip' | 'recording';
  title: string;
  subtitle: string;
  startTime: string;
  endTime: string;
  playbackUrl: string;
  downloadUrl: string;
  previewPath: string | null;
  status: StorageStatus;
  durationLabel: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type ApiPage<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type ApiCamera = {
  id: string;
  site_id: string;
  name: string;
  stream_url: string;
  protocol: 'rtsp' | 'onvif' | 'http' | 'hls';
  status: CameraStatus;
  detection_enabled: boolean;
  recording_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ApiSite = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
};

type ApiStream = {
  id: string;
  camera_id: string;
  stream_type: 'main' | 'sub' | 'snapshot';
  url: string;
  active: boolean;
  metadata?: {
    protocol?: string;
    codec?: string;
    resolution?: string;
    fps?: number;
  };
};

type ApiLive = {
  camera_id: string;
  status: CameraStatus;
  connection: {
    last_checked_at: string;
    latency_ms: number;
    online: boolean;
    provider: 'go2rtc' | 'direct';
    status: CameraStatus;
    stream_count: number;
    snapshot_available: boolean;
  };
  endpoints: {
    go2rtc_stream: string;
    hls_url: string;
    snapshot_url: string;
    webrtc_url: string;
  };
  streams: ApiStream[];
  latest_snapshot: {
    captured_at: string;
    storage_path: string;
    source: string;
  } | null;
};

type ApiTimelineItem = {
  id: string;
  type: 'clip' | 'recording';
  start_time: string;
  end_time: string;
  thumbnail_path: string | null;
  playback: {
    playback_url: string;
    download_url: string;
    preview_url?: string | null;
    storage_status?: string;
  };
  metadata: Record<string, unknown>;
};

type BrowserGlobals = typeof globalThis & {
  document: {
    body: {
      appendChild(node: unknown): void;
    };
    createElement(tag: 'a'): {
      href: string;
      download: string;
      click(): void;
      remove(): void;
    };
  };
  open?(url?: string, target?: string, features?: string): unknown;
};

const waveCOverlayOptions: Array<{ key: WaveCOverlayKey; label: string }> = [
  { key: 'boxes', label: 'Boxes' },
  { key: 'labels', label: 'Labels' },
  { key: 'tracks', label: 'Tracks' },
  { key: 'zones', label: 'Zones' },
  { key: 'heatmap', label: 'Heatmap' },
  { key: 'timestamps', label: 'Timestamps' },
];

const waveCThresholdOptions: Array<{ key: WaveCThresholdKey; label: string; hint: string }> = [
  { key: 'person', label: 'Person threshold', hint: 'Confidence for human detections' },
  { key: 'vehicle', label: 'Vehicle threshold', hint: 'Confidence for vehicles and assets' },
  { key: 'loitering', label: 'Loitering threshold', hint: 'Confidence for dwell and stall activity' },
];

const demoTenantId = '550e8400-e29b-41d4-a716-446655440002';

const fallbackCameras: Camera[] = [
  {
    id: 'north-yard',
    siteId: '550e8400-e29b-41d4-a716-446655440101',
    name: 'North Yard Entry',
    site: 'Zurich HQ',
    location: 'Gate 1',
    status: 'online',
    connectivity: 'stable',
    health: 'healthy',
    protocol: 'WebRTC',
    resolution: '4K',
    fps: 25,
    latencyMs: 118,
    bitrateMbps: 8.4,
    lastMotion: '12s ago',
    snapshotAge: '2s ago',
    recording: 'Continuous, hot storage',
    detectionEnabled: true,
    recordingEnabled: true,
    endpoint: '/streams/north-yard/webrtc',
    note: 'Primary feed is locked in and ready for live review.',
    motion: 'Perimeter movement detected at 08:14',
    streamCount: 2,
  },
  {
    id: 'lobby',
    siteId: '550e8400-e29b-41d4-a716-446655440101',
    name: 'Main Lobby',
    site: 'Zurich HQ',
    location: 'Reception',
    status: 'degraded',
    connectivity: 'reconnecting',
    health: 'warning',
    protocol: 'HLS fallback',
    resolution: '1080p',
    fps: 15,
    latencyMs: 412,
    bitrateMbps: 3.1,
    lastMotion: '4m ago',
    snapshotAge: '18s ago',
    recording: 'Adaptive, retry queue engaged',
    detectionEnabled: true,
    recordingEnabled: true,
    endpoint: '/streams/lobby/hls',
    note: 'Primary connection is recovering; fallback stream is visible.',
    motion: 'Lobby queue changed state at 08:07',
    streamCount: 1,
  },
  {
    id: 'loading-dock',
    siteId: '550e8400-e29b-41d4-a716-446655440202',
    name: 'Loading Dock',
    site: 'Basel Depot',
    location: 'South wall',
    status: 'offline',
    connectivity: 'disconnected',
    health: 'offline',
    protocol: 'HLS fallback',
    resolution: '720p',
    fps: 12,
    latencyMs: 0,
    bitrateMbps: 0,
    lastMotion: '32m ago',
    snapshotAge: '2m ago',
    recording: 'Spool queued for retry',
    detectionEnabled: false,
    recordingEnabled: false,
    endpoint: '/streams/loading-dock/fallback',
    note: 'Camera is not reachable yet; the registry still keeps the target visible.',
    motion: 'No recent motion samples',
    streamCount: 0,
  },
];

const fallbackTimeline: Record<string, TimelineItem[]> = {
  'north-yard': [
    {
      id: 'north-yard-recording-1',
      type: 'recording',
      title: 'Continuous recording',
      subtitle: 'North perimeter shift',
      startTime: '2024-01-01T07:55:00Z',
      endTime: '2024-01-01T08:25:00Z',
      playbackUrl: '/api/media/recordings/north-yard-recording-1/playback',
      downloadUrl: '/api/media/recordings/north-yard-recording-1/download',
      previewPath: null,
      status: 'local_only',
      durationLabel: '30m',
    },
    {
      id: 'north-yard-clip-1',
      type: 'clip',
      title: 'Motion clip',
      subtitle: 'Perimeter movement detected',
      startTime: '2024-01-01T08:14:00Z',
      endTime: '2024-01-01T08:16:00Z',
      playbackUrl: '/api/media/clips/north-yard-clip-1/playback',
      downloadUrl: '/api/media/clips/north-yard-clip-1/download',
      previewPath: '/var/lib/ainvr/previews/north-yard-clip-1.jpg',
      status: 'replicated',
      durationLabel: '2m',
    },
    {
      id: 'north-yard-clip-2',
      type: 'clip',
      title: 'Door event',
      subtitle: 'Manual review queued',
      startTime: '2024-01-01T08:42:00Z',
      endTime: '2024-01-01T08:44:30Z',
      playbackUrl: '/api/media/clips/north-yard-clip-2/playback',
      downloadUrl: '/api/media/clips/north-yard-clip-2/download',
      previewPath: '/var/lib/ainvr/previews/north-yard-clip-2.jpg',
      status: 'replicating',
      durationLabel: '3m',
    },
  ],
  lobby: [
    {
      id: 'lobby-clip-1',
      type: 'clip',
      title: 'Motion clip',
      subtitle: 'Lobby queue shift',
      startTime: '2024-01-01T08:07:00Z',
      endTime: '2024-01-01T08:08:00Z',
      playbackUrl: '/api/media/clips/lobby-clip-1/playback',
      downloadUrl: '/api/media/clips/lobby-clip-1/download',
      previewPath: null,
      status: 'degraded',
      durationLabel: '1m',
    },
    {
      id: 'lobby-recording-1',
      type: 'recording',
      title: 'Continuous recording',
      subtitle: 'Reception desk view',
      startTime: '2024-01-01T07:45:00Z',
      endTime: '2024-01-01T08:15:00Z',
      playbackUrl: '/api/media/recordings/lobby-recording-1/playback',
      downloadUrl: '/api/media/recordings/lobby-recording-1/download',
      previewPath: null,
      status: 'local_only',
      durationLabel: '30m',
    },
  ],
  'loading-dock': [],
};

function createDemoToken(roles: string[] = ['viewer']): string {
  const payload = {
    sub: '550e8400-e29b-41d4-a716-446655440999',
    email: 'demo-operator@ainvr.local',
    preferred_username: 'demo-operator',
    realm_access: { roles },
    groups: [],
    tenant_id: demoTenantId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'http://localhost:8080/auth/realms/ain-vr',
  };

  return `${btoa(JSON.stringify(payload))}.mock.signature`;
}

async function fetchApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success) {
    throw new Error(`Request failed for ${path}`);
  }

  return body.data;
}

async function fetchMediaBlob(path: string, token: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(path, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Media request failed: ${response.status}`);
  }

  return response.blob();
}

function formatRelativeTime(timestamp?: string | null): string {
  if (!timestamp) {
    return 'No recent sample';
  }

  const deltaSeconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return `${deltaHours}h ago`;
}

function formatAbsoluteTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatTimelineWindow(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start)} - ${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(end)}`;
}

function overlapsWindow(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
): boolean {
  return new Date(leftStart).getTime() <= new Date(rightEnd).getTime() && new Date(leftEnd).getTime() >= new Date(rightStart).getTime();
}

function statusTone(status: CameraStatus): string {
  switch (status) {
    case 'online':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'degraded':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
  }
}

function healthTone(health: StreamHealth): string {
  switch (health) {
    case 'healthy':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'warning':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
  }
}

function connectivityTone(connectivity: ConnectivityState): string {
  switch (connectivity) {
    case 'stable':
      return 'bg-emerald-400';
    case 'reconnecting':
      return 'bg-amber-400';
    default:
      return 'bg-rose-400';
  }
}

function mapConnectivity(status: CameraStatus): ConnectivityState {
  switch (status) {
    case 'online':
      return 'stable';
    case 'degraded':
      return 'reconnecting';
    default:
      return 'disconnected';
  }
}

function mapHealth(status: CameraStatus): StreamHealth {
  switch (status) {
    case 'online':
      return 'healthy';
    case 'degraded':
      return 'warning';
    default:
      return 'offline';
  }
}

function mapProtocol(protocol: ApiCamera['protocol'], live: ApiLive): Camera['protocol'] {
  if (protocol === 'rtsp' || protocol === 'onvif' || live.connection.provider === 'go2rtc') {
    return 'WebRTC';
  }

  return 'HLS fallback';
}

function normalizeStorageStatus(status?: string | null): StorageStatus {
  switch (status) {
    case 'local_only':
    case 'replicating':
    case 'replicated':
    case 'degraded':
    case 'missing':
      return status;
    default:
      return 'local_only';
  }
}

function storageTone(status: StorageStatus): string {
  switch (status) {
    case 'replicated':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'replicating':
      return 'border-sky-400/30 bg-sky-400/12 text-sky-100';
    case 'degraded':
    case 'missing':
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
    case 'local_only':
    default:
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
  }
}

function storageLabel(status: StorageStatus): string {
  switch (status) {
    case 'replicated':
      return 'Replicated';
    case 'replicating':
      return 'Replicating';
    case 'degraded':
      return 'Degraded';
    case 'missing':
      return 'Missing';
    default:
      return 'Local only';
  }
}

function storageDescription(status: StorageStatus): string {
  switch (status) {
    case 'replicated':
      return 'Material is safely copied to the remote target and remains instantly playable.';
    case 'replicating':
      return 'The local segment is complete and is still being copied to the secondary target.';
    case 'degraded':
      return 'Replication or verification is unhealthy, so this item deserves operator attention.';
    case 'missing':
      return 'The media record exists, but the underlying file is not available right now.';
    default:
      return 'The segment is present on the local engine and awaits replication or retention routing.';
  }
}

function incidentSeverityTone(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
    case 'high':
      return 'border-orange-400/30 bg-orange-400/12 text-orange-100';
    case 'medium':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
  }
}

function incidentStatusTone(status: string): string {
  switch (status) {
    case 'open':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'acknowledged':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'investigating':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    case 'resolved':
    case 'closed':
      return 'border-white/10 bg-white/5 text-slate-200';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function policyStateTone(enabled: boolean, armedState?: string): string {
  if (!enabled) {
    return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
  }

  switch (armedState) {
    case 'armed':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'partial':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function routeStateTone(state: string): string {
  switch (state) {
    case 'active':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'testing':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'paused':
      return 'border-white/10 bg-white/5 text-slate-300';
    default:
      return 'border-white/10 bg-white/5 text-slate-300';
  }
}

function phase8ResultTone(kind: Phase8SearchResult['kind']): string {
  switch (kind) {
    case 'incident':
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
    case 'clip':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'recording':
      return 'border-sky-400/30 bg-sky-400/12 text-sky-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function phase8EnrichmentTone(status: string): string {
  switch (status) {
    case 'ready':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'running':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'queued':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    case 'failed':
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function phase9ModuleTone(module: Phase9IdentityModule): string {
  switch (module) {
    case 'lpr':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'face':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'reid':
      return 'border-sky-400/30 bg-sky-400/12 text-sky-100';
  }
}

function phase9RiskTone(risk: string): string {
  switch (risk) {
    case 'critical':
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
    case 'high':
      return 'border-orange-400/30 bg-orange-400/12 text-orange-100';
    case 'medium':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
  }
}

function phase9TrackTone(status: string): string {
  switch (status) {
    case 'linked':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'candidate':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'stale':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function phase10LifecycleTone(status: string): string {
  switch (status) {
    case 'production':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'staged':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'running':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    case 'completed':
      return 'border-sky-400/30 bg-sky-400/12 text-sky-100';
    case 'rollback':
      return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
    case 'queued':
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function evidenceTone(kind: WaveCEvidence['kind']): string {
  switch (kind) {
    case 'camera':
      return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100';
    case 'clip':
      return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
    case 'recording':
      return 'border-sky-400/30 bg-sky-400/12 text-sky-100';
    case 'snapshot':
      return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function kindLabel(type: TimelineItem['type']): string {
  return type === 'clip' ? 'Clip' : 'Recording';
}

function kindTone(type: TimelineItem['type']): string {
  return type === 'clip'
    ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100'
    : 'border-white/10 bg-white/5 text-slate-200';
}

function buildCameraViewModel(
  camera: ApiCamera,
  site: ApiSite | undefined,
  live: ApiLive,
  streams: ApiStream[]
): Camera {
  const primaryStream = streams[0];
  const protocol = mapProtocol(camera.protocol, live);

  return {
    id: camera.id,
    siteId: camera.site_id,
    name: camera.name,
    site: site?.name || 'Unassigned site',
    location: site?.address || site?.timezone || 'Location pending',
    status: camera.status,
    connectivity: mapConnectivity(camera.status),
    health: mapHealth(camera.status),
    protocol,
    resolution: primaryStream?.metadata?.resolution || '1920x1080',
    fps: primaryStream?.metadata?.fps || 25,
    latencyMs: live.connection.latency_ms,
    bitrateMbps: Number((Math.max(1, live.connection.stream_count) * 2.4).toFixed(1)),
    lastMotion: `Checked ${formatRelativeTime(live.connection.last_checked_at)}`,
    snapshotAge: formatRelativeTime(live.latest_snapshot?.captured_at),
    recording: camera.recording_enabled ? 'Recording enabled' : 'Recording disabled',
    detectionEnabled: camera.detection_enabled,
    recordingEnabled: camera.recording_enabled,
    endpoint: protocol === 'WebRTC' ? live.endpoints.webrtc_url : live.endpoints.hls_url,
    note:
      live.connection.provider === 'go2rtc'
        ? 'Stream is registered through the media gateway and ready for live handoff.'
        : 'Direct playback path is available while gateway support remains minimal.',
    motion: live.latest_snapshot
      ? `Latest snapshot source: ${live.latest_snapshot.source}`
      : 'No snapshot captured yet for this camera.',
    streamCount: live.connection.stream_count,
  };
}

function buildTimelineItem(item: ApiTimelineItem): TimelineItem {
  const start = new Date(item.start_time);
  const end = new Date(item.end_time);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  const status = normalizeStorageStatus(item.playback.storage_status);

  return {
    id: item.id,
    type: item.type,
    title: kindLabel(item.type),
    subtitle: item.type === 'clip' ? 'Previewable event segment' : 'Continuous archive segment',
    startTime: item.start_time,
    endTime: item.end_time,
    playbackUrl: item.playback.playback_url,
    downloadUrl: item.playback.download_url,
    previewPath: item.playback.preview_url || item.thumbnail_path,
    status,
    durationLabel: `${durationMinutes}m`,
  };
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}): React.ReactElement {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-slate-950/30">
      <div className="text-xs uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function TimelineSkeleton(): React.ReactElement {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`timeline-skeleton-${index}`} className="animate-pulse rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-28 rounded-full bg-white/10" />
              <div className="h-3 w-44 rounded-full bg-white/10" />
            </div>
            <div className="h-7 w-20 rounded-full bg-white/10" />
          </div>
          <div className="mt-4 h-3 w-full rounded-full bg-white/10" />
          <div className="mt-3 flex gap-2">
            <div className="h-8 w-24 rounded-full bg-white/10" />
            <div className="h-8 w-24 rounded-full bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LiveDashboard(): React.ReactElement {
  const [cameras, setCameras] = useState<Camera[]>(fallbackCameras);
  const [selectedId, setSelectedId] = useState(fallbackCameras[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<'api' | 'fallback'>('fallback');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(
    fallbackTimeline[fallbackCameras[0]?.id ?? ''] ?? []
  );
  const [timelineStatus, setTimelineStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineTab, setTimelineTab] = useState<TimelineTab>('timeline');
  const [storageFilter, setStorageFilter] = useState<'all' | StorageStatus>('all');
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [playbackObjectUrl, setPlaybackObjectUrl] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [waveCContext, setWaveCContext] = useState<WaveCContext | null>(null);
  const [waveCStatus, setWaveCStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [waveCError, setWaveCError] = useState<string | null>(null);
  const [waveCSelectedIncidentId, setWaveCSelectedIncidentId] = useState<string | null>(null);
  const [waveCSelectedPolicyId, setWaveCSelectedPolicyId] = useState<string | null>(null);
  const [waveCSelectedZoneId, setWaveCSelectedZoneId] = useState<string | null>(null);
  const [waveCOverlays, setWaveCOverlays] = useState<Record<WaveCOverlayKey, boolean>>({
    boxes: true,
    labels: true,
    tracks: true,
    zones: true,
    heatmap: false,
    timestamps: true,
  });
  const [waveCThresholds, setWaveCThresholds] = useState<Record<WaveCThresholdKey, number>>({
    person: 68,
    vehicle: 64,
    loitering: 72,
  });
  const [phase8Query, setPhase8Query] = useState('');
  const deferredPhase8Query = useDeferredValue(phase8Query);
  const [phase8Filters, setPhase8Filters] = useState<Phase8SearchFilters>({
    sourceType: 'all',
    severity: 'all',
    vlmOnly: false,
  });
  const [phase8Workspace, setPhase8Workspace] = useState<Phase8Workspace | null>(null);
  const [phase8Status, setPhase8Status] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [phase8Error, setPhase8Error] = useState<string | null>(null);
  const [phase8SelectedResultId, setPhase8SelectedResultId] = useState<string | null>(null);
  const phase8SeededQueryRef = useRef(false);
  const [phase9Workspace, setPhase9Workspace] = useState<Phase9Workspace | null>(null);
  const [phase9Status, setPhase9Status] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [phase9Error, setPhase9Error] = useState<string | null>(null);
  const [phase9SelectedModule, setPhase9SelectedModule] = useState<Phase9IdentityModule>('lpr');
  const [phase9SelectedWatchlistId, setPhase9SelectedWatchlistId] = useState<string | null>(null);

  const initialCamera = cameras[0];
  if (!initialCamera) {
    throw new Error('Camera fixtures are required for the live dashboard.');
  }

  useEffect(() => {
    let active = true;

    async function loadDashboardData(): Promise<void> {
      const token = createDemoToken();

      if (active) {
        setRefreshing(true);
      }

      try {
        const [sitesPage, camerasPage] = await Promise.all([
          fetchApi<ApiPage<ApiSite>>('/api/sites?page=1&pageSize=50', token),
          fetchApi<ApiPage<ApiCamera>>('/api/cameras?page=1&pageSize=50', token),
        ]);

        const nextCameras = await Promise.all(
          camerasPage.data.map(async (camera) => {
            const [live, streamsResponse] = await Promise.all([
              fetchApi<ApiLive>(`/api/cameras/${camera.id}/live`, token),
              fetchApi<{ camera_id: string; status: CameraStatus; streams: ApiStream[] }>(
                `/api/cameras/${camera.id}/streams`,
                token
              ),
            ]);

            return buildCameraViewModel(
              camera,
              sitesPage.data.find((site) => site.id === camera.site_id),
              live,
              streamsResponse.streams
            );
          })
        );

        if (!active || nextCameras.length === 0) {
          return;
        }

        setCameras(nextCameras);
        setDataSource('api');
        setErrorMessage(null);
        startTransition(() => {
          setSelectedId((current) =>
            nextCameras.some((camera) => camera.id === current) ? current : nextCameras[0]!.id
          );
        });
      } catch {
        if (!active) {
          return;
        }

        setCameras(fallbackCameras);
        setDataSource('fallback');
        setErrorMessage('Live API unavailable, showing fallback registry data.');
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadDashboardData();
    const intervalId = setInterval(() => {
      void loadDashboardData();
    }, 15000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  const selectedCamera = cameras.find((camera) => camera.id === selectedId) ?? initialCamera;
  const onlineCount = cameras.filter((camera) => camera.status === 'online').length;
  const healthyCount = cameras.filter((camera) => camera.health === 'healthy').length;
  const totalStreams = useMemo(
    () => cameras.reduce((sum, camera) => sum + camera.streamCount, 0),
    [cameras]
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadWaveC(): Promise<void> {
      setWaveCStatus('loading');
      setWaveCError(null);

      try {
        const context = await loadWaveCContext({
          token: createDemoToken(['operator']),
          siteId: selectedCamera.siteId,
          siteName: selectedCamera.site,
          cameraId: selectedCamera.id,
          cameraName: selectedCamera.name,
          signal: controller.signal,
        });

        if (!active) {
          return;
        }

        setWaveCContext(context);
        setWaveCStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setWaveCContext(null);
        setWaveCStatus('error');
        setWaveCError(error instanceof Error ? error.message : 'Wave C data could not be loaded.');
      }
    }

    void loadWaveC();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedCamera.id, selectedCamera.site, selectedCamera.siteId, selectedCamera.name]);

  useEffect(() => {
    if (!waveCContext?.incidents.length) {
      return;
    }

    setWaveCSelectedIncidentId((current) =>
      current && waveCContext.incidents.some((incident) => incident.id === current)
        ? current
        : waveCContext.incidents[0]!.id
    );
  }, [waveCContext]);

  useEffect(() => {
    if (!waveCContext?.policies.length) {
      return;
    }

    setWaveCSelectedPolicyId((current) =>
      current && waveCContext.policies.some((policy) => policy.id === current)
        ? current
        : waveCContext.policies[0]!.id
    );
  }, [waveCContext]);

  useEffect(() => {
    if (!waveCContext?.zones.length) {
      return;
    }

    setWaveCSelectedZoneId((current) =>
      current && waveCContext.zones.some((zone) => zone.id === current) ? current : waveCContext.zones[0]!.id
    );
  }, [waveCContext]);

  useEffect(() => {
    let active = true;

    async function loadTimeline(): Promise<void> {
      setTimelineStatus('loading');
      setTimelineError(null);

      if (dataSource !== 'api') {
        setTimelineItems(fallbackTimeline[selectedCamera.id] ?? []);
        setTimelineStatus('ready');
        return;
      }

      try {
        const token = createDemoToken();
        const timeline = await fetchApi<{
          camera_id: string;
          items: ApiTimelineItem[];
          page: number;
          pageSize: number;
          total: number;
          hasMore: boolean;
        }>(`/api/timeline?camera_id=${selectedCamera.id}`, token);

        if (!active) {
          return;
        }

        setTimelineItems(timeline.items.map(buildTimelineItem));
        setTimelineStatus('ready');
      } catch {
        if (!active) {
          return;
        }

        setTimelineItems(fallbackTimeline[selectedCamera.id] ?? []);
        setTimelineStatus('error');
        setTimelineError('Live timeline API unavailable, showing fallback items.');
      }
    }

    void loadTimeline();

    return () => {
      active = false;
    };
  }, [dataSource, selectedCamera.id]);

  const visibleTimelineItems = useMemo(() => {
    const baseItems =
      timelineTab === 'recordings'
        ? timelineItems.filter((item) => item.type === 'recording')
        : timelineTab === 'clips'
          ? timelineItems.filter((item) => item.type === 'clip')
          : timelineItems;

    return baseItems.filter((item) => storageFilter === 'all' || item.status === storageFilter);
  }, [storageFilter, timelineItems, timelineTab]);

  const timelineStats = useMemo(() => {
    const counts = timelineItems.reduce(
      (accumulator, item) => {
        accumulator.total += 1;
        accumulator[item.type] += 1;
        accumulator[item.status] += 1;
        if (item.status === 'local_only' || item.status === 'replicating' || item.status === 'degraded') {
          accumulator.attention += 1;
        }
        return accumulator;
      },
      {
        total: 0,
        clip: 0,
        recording: 0,
        local_only: 0,
        replicating: 0,
        replicated: 0,
        degraded: 0,
        missing: 0,
        attention: 0,
      }
    );

    return counts;
  }, [timelineItems]);

  useEffect(() => {
    if (visibleTimelineItems.length === 0) {
      setSelectedTimelineId(null);
      return;
    }

    setSelectedTimelineId((current) =>
      current && visibleTimelineItems.some((item) => item.id === current)
        ? current
        : visibleTimelineItems[0]!.id
    );
  }, [visibleTimelineItems]);

  const selectedTimelineItem = useMemo(
    () => visibleTimelineItems.find((item) => item.id === selectedTimelineId) ?? visibleTimelineItems[0] ?? null,
    [selectedTimelineId, visibleTimelineItems]
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let currentObjectUrl: string | null = null;

    async function loadPlaybackPreview(): Promise<void> {
      if (!selectedTimelineItem) {
        setPlaybackObjectUrl(null);
        setPlaybackState('idle');
        setPlaybackError(null);
        return;
      }

      if (dataSource !== 'api') {
        setPlaybackObjectUrl(null);
        setPlaybackState('idle');
        setPlaybackError('Fallback mode exposes the playback path but not the protected video stream.');
        return;
      }

      setPlaybackState('loading');
      setPlaybackError(null);

      try {
        const token = createDemoToken();
        const blob = await fetchMediaBlob(selectedTimelineItem.playbackUrl, token, controller.signal);
        if (!active) {
          return;
        }

        currentObjectUrl = URL.createObjectURL(blob);
        setPlaybackObjectUrl(currentObjectUrl);
        setPlaybackState('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setPlaybackObjectUrl(null);
        setPlaybackState('error');
        setPlaybackError(error instanceof Error ? error.message : 'Playback preview could not be loaded.');
      }
    }

    void loadPlaybackPreview();

    return () => {
      active = false;
      controller.abort();
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [dataSource, selectedTimelineItem?.id]);

  async function handleDownload(item: TimelineItem): Promise<void> {
    setDownloadBusy(true);
    try {
      const token = createDemoToken();
      const blob = await fetchMediaBlob(item.downloadUrl, token);
      const objectUrl = URL.createObjectURL(blob);
      const browser = globalThis as BrowserGlobals;
      const link = browser.document.createElement('a');
      link.href = objectUrl;
      link.download = `${item.type}-${item.id}.mp4`;
      browser.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloadBusy(false);
    }
  }

  const cameraLookup = useMemo(() => new Map(cameras.map((camera) => [camera.id, camera])), [cameras]);
  const waveCIncidents = waveCContext?.incidents ?? [];
  const waveCPolicies = waveCContext?.policies ?? [];
  const waveCZones = waveCContext?.zones ?? [];
  const selectedWaveCIncident =
    waveCIncidents.find((incident) => incident.id === waveCSelectedIncidentId) ?? waveCIncidents[0] ?? null;
  const selectedWaveCPolicy =
    waveCPolicies.find((policy) => policy.id === waveCSelectedPolicyId) ?? waveCPolicies[0] ?? null;
  const selectedWaveCZone = waveCZones.find((zone) => zone.id === waveCSelectedZoneId) ?? waveCZones[0] ?? null;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadPhase8(): Promise<void> {
      setPhase8Status('loading');
      setPhase8Error(null);

      try {
        const workspace = await loadPhase8Workspace({
          token: createDemoToken(['operator']),
          siteId: selectedCamera.siteId,
          siteName: selectedCamera.site,
          cameraId: selectedCamera.id,
          cameraName: selectedCamera.name,
          query: deferredPhase8Query,
          filters: phase8Filters,
          incidents: selectedWaveCIncident
            ? [selectedWaveCIncident, ...waveCIncidents.filter((incident) => incident.id !== selectedWaveCIncident.id)]
            : waveCIncidents,
          timelineItems,
          selectedIncidentId: selectedWaveCIncident?.id ?? null,
          signal: controller.signal,
        });

        if (!active) {
          return;
        }

        setPhase8Workspace(workspace);
        setPhase8Status('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setPhase8Workspace(null);
        setPhase8Status('error');
        setPhase8Error(error instanceof Error ? error.message : 'Phase 8 search could not be loaded.');
      }
    }

    void loadPhase8();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    deferredPhase8Query,
    phase8Filters,
    selectedCamera.id,
    selectedCamera.name,
    selectedCamera.site,
    selectedCamera.siteId,
    selectedWaveCIncident?.id,
    timelineItems,
    waveCIncidents,
  ]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadPhase9(): Promise<void> {
      setPhase9Status('loading');
      setPhase9Error(null);

      try {
        const workspace = await loadPhase9Workspace({
          token: createDemoToken(['operator']),
          siteId: selectedCamera.siteId,
          siteName: selectedCamera.site,
          cameraId: selectedCamera.id,
          cameraName: selectedCamera.name,
          incidents: waveCIncidents,
          timelineItems,
          signal: controller.signal,
        });

        if (!active) {
          return;
        }

        setPhase9Workspace(workspace);
        setPhase9Status('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setPhase9Workspace(null);
        setPhase9Status('error');
        setPhase9Error(error instanceof Error ? error.message : 'Wave D workspace could not be loaded.');
      }
    }

    void loadPhase9();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    selectedCamera.id,
    selectedCamera.name,
    selectedCamera.site,
    selectedCamera.siteId,
    selectedWaveCIncident?.id,
    timelineItems,
    waveCIncidents,
  ]);

  useEffect(() => {
    if (!phase9Workspace?.modules.length) {
      setPhase9SelectedModule('lpr');
      return;
    }

    setPhase9SelectedModule((current) =>
      current && phase9Workspace.modules.some((module) => module.id === current)
        ? current
        : phase9Workspace.modules[0]!.id
    );
  }, [phase9Workspace]);

  useEffect(() => {
    if (!phase9Workspace?.watchlists.length) {
      setPhase9SelectedWatchlistId(null);
      return;
    }

    setPhase9SelectedWatchlistId((current) =>
      current && phase9Workspace.watchlists.some((entry) => entry.id === current)
        ? current
        : phase9Workspace.watchlists[0]!.id
    );
  }, [phase9Workspace]);

  const waveCIncidentViews = useMemo(() => {
    return waveCIncidents.map((incident) => {
      const cameraNames = incident.camera_ids.map((cameraId) => cameraLookup.get(cameraId)?.name ?? cameraId);
      const matchingTimeline = timelineItems.find((item) =>
        overlapsWindow(item.startTime, item.endTime, incident.timeline_start, incident.timeline_end)
      );

      return {
        incident,
        cameraNames,
        policySummary: Object.entries(incident.policy_hits)
          .map(([key, value]) => `${key}:${typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value)}`)
          .join(' · '),
        evidence: [
          ...buildIncidentEvidencePreview(incident),
          ...(matchingTimeline
            ? [
                {
                  id: `${incident.id}-timeline-match`,
                  label: `${matchingTimeline.type === 'clip' ? 'Clip' : 'Recording'} match`,
                  kind: matchingTimeline.type === 'clip' ? ('clip' as const) : ('recording' as const),
                  ref: matchingTimeline.playbackUrl,
                  status: matchingTimeline.status,
                },
              ]
            : []),
        ] satisfies WaveCEvidence[],
        matchingTimeline,
      };
    });
  }, [cameraLookup, timelineItems, waveCIncidents]);

  const waveCPolicyViews = useMemo(() => {
    return waveCPolicies.map((policy, index) => {
      const routePreview: WaveCRoute[] = buildPolicyRoutes(policy);
      const zoneNames = Array.isArray(policy.conditions['zones'])
        ? policy.conditions['zones'].map((zone) => String(zone))
        : waveCZones.map((zone) => zone.name).slice(0, 3);

      return {
        policy,
        scopeLabel: policy.site_id ? `${waveCContext?.siteName ?? selectedCamera.site} · site scope` : 'Tenant-wide scope',
        conditionSummary: summarizePolicyConditions(policy),
        scheduleSummary: summarizePolicySchedule(policy),
        severitySummary: summarizePolicySeverity(policy),
        routePreview,
        escalationPreview: buildPolicyEscalationPreview(policy),
        zoneNames,
        zoneCoverageLabel: buildZoneCoverageLabel(waveCZones[index] ?? selectedWaveCZone ?? waveCZones[0] ?? {
          id: policy.id,
          site_id: policy.site_id ?? selectedCamera.siteId,
          name: policy.name,
          polygon: {},
          zone_type: 'restricted_zone',
          created_at: policy.created_at,
          updated_at: policy.updated_at,
        }, index),
      };
    });
  }, [selectedCamera.site, selectedCamera.siteId, selectedWaveCZone, waveCContext?.siteName, waveCPolicies, waveCZones]);

  const waveCOverview = useMemo(() => {
    const incidentCounts = waveCIncidents.reduce(
      (accumulator, incident) => {
        accumulator.total += 1;
        accumulator[incident.status] += 1;
        if (incident.escalation_state === 'critical') {
          accumulator.critical += 1;
        } else if (incident.escalation_state === 'escalated') {
          accumulator.escalated += 1;
        }
        return accumulator;
      },
      {
        total: 0,
        open: 0,
        acknowledged: 0,
        investigating: 0,
        resolved: 0,
        closed: 0,
        critical: 0,
        escalated: 0,
      }
    );

    const armedPolicies = waveCPolicies.filter((policy) => policy.enabled && policy.armed_state === 'armed').length;
    const routes = waveCPolicyViews.reduce((total, view) => total + view.routePreview.length, 0);

    return {
      incidentCounts,
      armedPolicies,
      totalPolicies: waveCPolicies.length,
      totalZones: waveCZones.length,
      routes,
    };
  }, [waveCIncidents, waveCPolicies, waveCPolicyViews, waveCZones]);

  const waveCDetection = useMemo(() => {
    const thresholdAverage = Math.round(
      (waveCThresholds.person + waveCThresholds.vehicle + waveCThresholds.loitering) / 3
    );
    const confidence = Math.max(45, Math.min(98, selectedCamera.health === 'healthy' ? thresholdAverage + 14 : thresholdAverage + 6));
    const queueDepth = Math.max(0, waveCOverview.incidentCounts.open + waveCOverview.incidentCounts.investigating - 1);
    const activeOverlays = Object.entries(waveCOverlays)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    const matchingTimelineItem = selectedWaveCIncident
      ? timelineItems.find((item) =>
          overlapsWindow(item.startTime, item.endTime, selectedWaveCIncident.timeline_start, selectedWaveCIncident.timeline_end)
        )
      : selectedTimelineItem;

    const previewEvents = [
      {
        id: 'motion-preview',
        label: selectedCamera.motion,
        source: selectedCamera.name,
        severity: selectedCamera.health === 'healthy' ? 'warning' : 'critical',
        confidence,
      },
      selectedWaveCIncident
        ? {
            id: selectedWaveCIncident.id,
            label: selectedWaveCIncident.summary,
            source: selectedWaveCIncident.category,
            severity: selectedWaveCIncident.severity,
            confidence: Math.round(selectedWaveCIncident.confidence * 100),
          }
        : null,
      matchingTimelineItem
        ? {
            id: matchingTimelineItem.id,
            label: `${kindLabel(matchingTimelineItem.type)} evidence`,
            source: storageLabel(matchingTimelineItem.status),
            severity: matchingTimelineItem.status === 'degraded' ? 'critical' : 'info',
            confidence: matchingTimelineItem.status === 'replicated' ? 96 : 79,
          }
        : null,
    ].filter((event): event is { id: string; label: string; source: string; severity: string; confidence: number } => event !== null);

    return {
      selectedZone: selectedWaveCZone,
      confidence,
      queueDepth,
      activeOverlays,
      thresholdAverage,
      previewEvents,
    };
  }, [
    selectedCamera.health,
    selectedCamera.motion,
    selectedCamera.name,
    selectedTimelineItem,
    selectedWaveCIncident,
    selectedWaveCZone,
    waveCOverview.incidentCounts.open,
    waveCOverview.incidentCounts.investigating,
    waveCOverlays,
    waveCThresholds.loitering,
    waveCThresholds.person,
    waveCThresholds.vehicle,
    timelineItems,
  ]);

  const selectedWaveCIncidentView =
    waveCIncidentViews.find((view) => view.incident.id === selectedWaveCIncident?.id) ?? waveCIncidentViews[0] ?? null;
  const selectedWaveCPolicyView =
    waveCPolicyViews.find((view) => view.policy.id === selectedWaveCPolicy?.id) ?? waveCPolicyViews[0] ?? null;

  const waveCNotice =
    waveCContext && waveCContext.partialFallbacks.length > 0
      ? `Fallback demo data active for ${waveCContext.partialFallbacks.join(', ')}`
      : waveCContext
        ? 'Live API data resolved for incidents, policies, and zones'
        : null;

  useEffect(() => {
    if (!phase8Workspace?.results.length) {
      setPhase8SelectedResultId(null);
      return;
    }

    setPhase8SelectedResultId((current) =>
      current && phase8Workspace.results.some((result) => result.id === current) ? current : phase8Workspace.results[0]!.id
    );
  }, [phase8Workspace]);

  useEffect(() => {
    if (phase8SeededQueryRef.current || phase8Query.trim().length > 0 || !selectedWaveCIncident) {
      return;
    }

    setPhase8Query(selectedWaveCIncident.summary);
    phase8SeededQueryRef.current = true;
  }, [phase8Query, selectedWaveCIncident]);

  const phase8Results = phase8Workspace?.results ?? [];
  const selectedPhase8Result =
    phase8Results.find((result) => result.id === phase8SelectedResultId) ?? phase8Results[0] ?? null;
  const selectedPhase8IncidentSummary =
    selectedWaveCIncident && phase8Workspace
      ? phase8Workspace.summariesByIncidentId[selectedWaveCIncident.id] ?? null
      : null;
  const selectedPhase8IncidentEnrichments =
    selectedWaveCIncident && phase8Workspace
      ? phase8Workspace.enrichmentsByIncidentId[selectedWaveCIncident.id] ?? []
      : [];
  const phase8ResultStats = useMemo(() => {
    return phase8Results.reduce(
      (accumulator, result) => {
        accumulator.total += 1;
        accumulator[result.kind] += 1;
        if (result.vlmSummary) {
          accumulator.vlm += 1;
        }
        return accumulator;
      },
      {
        total: 0,
        incident: 0,
        clip: 0,
        recording: 0,
        vlm: 0,
      }
    );
  }, [phase8Results]);
  const phase9Modules = phase9Workspace?.modules ?? [];
  const phase9Watchlists = phase9Workspace?.watchlists ?? [];
  const phase9Events = phase9Workspace?.events ?? [];
  const phase9ReidTracks = phase9Workspace?.reidTracks ?? [];
  const phase9ModelLifecycle = phase9Workspace?.modelLifecycle ?? null;
  const phase9LifecycleStages = phase9ModelLifecycle?.stages ?? [];
  const phase9LifecycleAnnotations = phase9ModelLifecycle?.annotations ?? [];
  const phase9LifecycleDatasets = phase9ModelLifecycle?.datasets ?? [];
  const phase9LifecycleTrainingJobs = phase9ModelLifecycle?.trainingJobs ?? [];
  const phase9LifecycleModels = phase9ModelLifecycle?.models ?? [];
  const phase9LifecycleDeployments = phase9ModelLifecycle?.deployments ?? [];
  const selectedPhase9Module =
    phase9Modules.find((module) => module.id === phase9SelectedModule) ?? phase9Modules[0] ?? null;
  const selectedPhase9Watchlist =
    phase9Watchlists.find((entry) => entry.id === phase9SelectedWatchlistId) ?? phase9Watchlists[0] ?? null;
  const phase9EventsForModule = phase9Events.filter((event) => event.module === phase9SelectedModule);
  const phase9WatchlistsForModule = phase9Watchlists.filter((entry) => entry.module === phase9SelectedModule);
  const phase9QueueLabel =
    !phase9Workspace
      ? 'Wave D workspace loading'
      : phase9Workspace.partialFallbacks.length
        ? `Wave D fallback for ${phase9Workspace.partialFallbacks.join(', ')}`
        : 'Wave D API-backed workspace';

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Phase 4 timeline and playback</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Timeline, playback, and replication status in one operator view
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Recordings and clips can now be filtered, reviewed, and downloaded from a single panel,
                  with local-only, replicating, replicated, and degraded storage states made explicit.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-left sm:min-w-[24rem]">
                <MetricCard label="Cameras" value={String(cameras.length)} detail="Registry entries visible" />
                <MetricCard label="Online" value={String(onlineCount)} detail="Connected streams" />
                <MetricCard label="Streams" value={String(totalStreams)} detail={`${healthyCount} healthy cameras`} />
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.95fr)] lg:p-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Camera Grid</h2>
                  <p className="text-sm text-slate-400">Select a camera to open the live detail panel.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                    Discovery {'->'} registration {'->'} timeline
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                    {dataSource === 'api' ? 'API live' : 'Fallback mode'}
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                    {refreshing ? 'Refreshing' : loading ? 'Loading' : 'Stable'}
                  </div>
                </div>
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {errorMessage}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cameras.map((camera) => {
                  const isSelected = camera.id === selectedCamera.id;

                  return (
                    <button
                      key={camera.id}
                      type="button"
                      onClick={() => setSelectedId(camera.id)}
                      className={[
                        'group overflow-hidden rounded-3xl border text-left transition duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-cyan-400/70 focus:ring-offset-2 focus:ring-offset-slate-950',
                        isSelected
                          ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.28)]'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,rgba(34,211,238,0.2),transparent_20%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.16),transparent_18%),linear-gradient(180deg,rgba(2,6,23,0.15),rgba(2,6,23,0.75))]" />
                        <div className="absolute inset-x-4 top-4 flex items-center justify-between">
                          <span
                            className={[
                              'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.24em]',
                              statusTone(camera.status),
                            ].join(' ')}
                          >
                            <span className={['h-2 w-2 rounded-full', connectivityTone(camera.connectivity)].join(' ')} />
                            {camera.status}
                          </span>
                          <span className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-200">
                            {camera.protocol}
                          </span>
                        </div>
                        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.32em] text-slate-400">{camera.site}</div>
                            <div className="mt-1 text-lg font-semibold text-white">{camera.name}</div>
                            <div className="text-sm text-slate-300">{camera.location}</div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-right">
                            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Latency</div>
                            <div className="text-sm font-semibold text-white">
                              {camera.latencyMs ? `${camera.latencyMs} ms` : 'Offline'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={[
                              'rounded-full border px-2.5 py-1 text-xs font-medium',
                              healthTone(camera.health),
                            ].join(' ')}
                          >
                            Stream {camera.health}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
                            {camera.resolution} / {camera.fps} fps
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
                            {camera.streamCount} stream{camera.streamCount === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <span className="text-sm text-slate-300">Endpoint</span>
                            <span className="max-w-[60%] truncate text-right text-sm font-medium text-white">
                              {camera.endpoint}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <span className="text-sm text-slate-300">Snapshot</span>
                            <span className="text-sm font-medium text-white">{camera.snapshotAge}</span>
                          </div>
                        </div>

                        <p className="text-sm leading-6 text-slate-300">{camera.note}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="lg:sticky lg:top-6">
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-slate-950/30 backdrop-blur">
                <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Playback console</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">{selectedCamera.name}</h2>
                      <p className="text-sm text-slate-400">
                        {selectedCamera.site} · {selectedCamera.location}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={[
                          'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]',
                          statusTone(selectedCamera.status),
                        ].join(' ')}
                      >
                        {selectedCamera.status}
                      </span>
                      <span
                        className={[
                          'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]',
                          healthTone(selectedCamera.health),
                        ].join(' ')}
                      >
                        {selectedCamera.health} stream
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80">
                    <div className="aspect-video">
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-950 via-slate-950 to-slate-900" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_28%,rgba(56,189,248,0.22),transparent_18%),radial-gradient(circle_at_70%_24%,rgba(45,212,191,0.18),transparent_16%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(15,23,42,0.7))]" />
                      <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs uppercase tracking-[0.28em] text-slate-200">
                          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_0_6px_rgba(34,211,238,0.12)]" />
                          {selectedTimelineItem ? `${kindLabel(selectedTimelineItem.type)} playback` : 'Playback'}
                        </div>
                        <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs uppercase tracking-[0.28em] text-slate-200">
                          {selectedTimelineItem ? storageLabel(selectedTimelineItem.status) : selectedCamera.protocol}
                        </div>
                      </div>

                      {selectedTimelineItem ? (
                        <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                              {selectedTimelineItem.title} · {selectedTimelineItem.subtitle}
                            </div>
                            <div className="mt-1 text-lg font-semibold text-white">
                              {formatAbsoluteTime(selectedTimelineItem.startTime)} · {selectedTimelineItem.durationLabel}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-right">
                            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Storage state</div>
                            <div className="text-sm font-semibold text-white">{storageLabel(selectedTimelineItem.status)}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                          <div className="max-w-sm">
                            <div className="text-sm uppercase tracking-[0.32em] text-slate-500">No playback selected</div>
                            <p className="mt-3 text-sm leading-6 text-slate-300">
                              Pick an item from the timeline to load the protected playback stream.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      label="Latency"
                      value={selectedCamera.latencyMs ? `${selectedCamera.latencyMs} ms` : 'Offline'}
                      detail="WebRTC / HLS handoff visible"
                    />
                    <MetricCard
                      label="Streams"
                      value={String(selectedCamera.streamCount)}
                      detail={selectedCamera.recording}
                    />
                  </div>

                  <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Playback actions</h3>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                          Preview and download use the authenticated media routes
                        </p>
                      </div>
                      {selectedTimelineItem ? (
                        <span className={['rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]', storageTone(selectedTimelineItem.status)].join(' ')}>
                          {storageLabel(selectedTimelineItem.status)}
                        </span>
                      ) : null}
                    </div>

                    {selectedTimelineItem ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (playbackObjectUrl) {
                                const browser = globalThis as BrowserGlobals;
                                browser.open?.(playbackObjectUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            disabled={!playbackObjectUrl || playbackState !== 'ready'}
                            className="rounded-2xl border border-cyan-400/30 bg-cyan-400/12 px-4 py-3 text-left text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">Preview</div>
                            <div className="mt-1">{playbackState === 'loading' ? 'Loading player…' : 'Open playback preview'}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownload(selectedTimelineItem)}
                            disabled={downloadBusy || dataSource !== 'api'}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Download</div>
                            <div className="mt-1">{downloadBusy ? 'Preparing download…' : 'Save media file locally'}</div>
                          </button>
                        </div>

                        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80">
                          {playbackState === 'loading' ? (
                            <div className="flex aspect-video items-center justify-center">
                              <div className="animate-pulse text-sm uppercase tracking-[0.3em] text-slate-500">
                                Loading authenticated preview…
                              </div>
                            </div>
                          ) : playbackObjectUrl ? (
                            <video
                              key={selectedTimelineItem.id}
                              src={playbackObjectUrl}
                              controls
                              playsInline
                              className="aspect-video w-full bg-black"
                            />
                          ) : (
                            <div className="flex aspect-video items-center justify-center px-8 text-center">
                              <div className="max-w-md">
                                <div className="text-sm uppercase tracking-[0.3em] text-slate-500">Preview unavailable</div>
                                <p className="mt-3 text-sm leading-6 text-slate-300">
                                  {playbackError || 'This item has no loaded player yet.'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Playback route</div>
                            <p className="mt-2 break-all text-sm text-slate-200">{selectedTimelineItem.playbackUrl}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Download route</div>
                            <p className="mt-2 break-all text-sm text-slate-200">{selectedTimelineItem.downloadUrl}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                        Select a recording or clip to expose the playback and download actions.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Timeline</div>
                        <h3 className="mt-2 text-lg font-semibold text-white">Recent media</h3>
                      </div>
                      <div className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
                        {timelineStats.total} items
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {([
                        ['timeline', 'Timeline'],
                        ['recordings', `Recordings (${timelineStats.recording})`],
                        ['clips', `Clips (${timelineStats.clip})`],
                      ] as const).map(([tab, label]) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setTimelineTab(tab)}
                          className={[
                            'rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition',
                            timelineTab === tab
                              ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-50'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(['all', 'local_only', 'replicating', 'replicated', 'degraded'] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setStorageFilter(status)}
                          className={[
                            'rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition',
                            storageFilter === status
                              ? 'border-white/30 bg-white/10 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]',
                          ].join(' ')}
                        >
                          {status === 'all' ? 'All states' : storageLabel(status)}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Local</div>
                        <div className="mt-1 text-base font-semibold text-white">{timelineStats.local_only}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Replicating</div>
                        <div className="mt-1 text-base font-semibold text-white">{timelineStats.replicating}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Replicated</div>
                        <div className="mt-1 text-base font-semibold text-white">{timelineStats.replicated}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Attention</div>
                        <div className="mt-1 text-base font-semibold text-white">{timelineStats.attention}</div>
                      </div>
                    </div>

                    {timelineStatus === 'loading' ? (
                      <TimelineSkeleton />
                    ) : timelineError ? (
                      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        {timelineError}
                      </div>
                    ) : null}

                    <div className="space-y-3">
                      {visibleTimelineItems.length > 0 ? (
                        visibleTimelineItems.map((item) => {
                          const isSelected = item.id === selectedTimelineItem?.id;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedTimelineId(item.id)}
                              className={[
                                'w-full rounded-2xl border px-4 py-4 text-left transition',
                                isSelected
                                  ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                                  : 'border-white/10 bg-slate-950/50 hover:border-white/20 hover:bg-slate-950/70',
                              ].join(' ')}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', kindTone(item.type)].join(' ')}>
                                      {kindLabel(item.type)}
                                    </span>
                                    <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', storageTone(item.status)].join(' ')}>
                                      {storageLabel(item.status)}
                                    </span>
                                  </div>
                                  <div className="mt-3 text-sm font-semibold text-white">{item.title}</div>
                                  <div className="mt-1 text-sm text-slate-400">{item.subtitle}</div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-sm font-semibold text-white">{item.durationLabel}</div>
                                  <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                    {formatTimelineWindow(item.startTime, item.endTime)}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div className="space-y-1 text-sm text-slate-300">
                                  <div className="break-all text-slate-400">{item.playbackUrl}</div>
                                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                                    {item.previewPath ? `Preview artifact ${item.previewPath}` : 'No dedicated preview artifact'}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                                    {item.status}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                                    {formatAbsoluteTime(item.startTime)}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : timelineStatus === 'ready' ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                          No {timelineTab === 'timeline' ? 'timeline' : timelineTab} items match the current storage filter.
                          <button
                            type="button"
                            onClick={() => setStorageFilter('all')}
                            className="ml-2 text-cyan-200 underline decoration-cyan-200/40 underline-offset-4"
                          >
                            Clear filter
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                          Timeline data is still loading.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                        Storage state legend
                      </h3>
                      <span className="text-xs uppercase tracking-[0.28em] text-slate-500">Phase 4 exit gate</span>
                    </div>

                    <div className="space-y-2 text-sm text-slate-300">
                      {(['local_only', 'replicating', 'replicated', 'degraded'] as const).map((status) => (
                        <div key={status} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', storageTone(status)].join(' ')}>
                              {storageLabel(status)}
                            </span>
                            <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                              {status === 'replicated'
                                ? 'Remote copy verified'
                                : status === 'replicating'
                                  ? 'Copy in progress'
                                  : status === 'degraded'
                                    ? 'Attention required'
                                    : 'Only local engine copy'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-400">{storageDescription(status)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                        Stream health checks
                      </h3>
                      <span className="text-xs uppercase tracking-[0.28em] text-slate-500">Current camera</span>
                    </div>
                    <div className="space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <span>Connectivity</span>
                        <span className="font-medium text-white">{selectedCamera.connectivity}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <span>Primary protocol</span>
                        <span className="font-medium text-white">{selectedCamera.protocol}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <span>Last check</span>
                        <span className="font-medium text-white">{selectedCamera.lastMotion}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <span>Snapshot freshness</span>
                        <span className="font-medium text-white">{selectedCamera.snapshotAge}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <span>Registry source</span>
                        <span className="font-medium text-white">{dataSource}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Recent stream event</div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{selectedCamera.motion}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{selectedCamera.note}</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Wave C operator intelligence</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Detection Studio, Incident Inbox, and Policy/Alerting in one place
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Phase 5 feeds detections, Phase 6 turns them into operator incidents, and Phase 7 routes the
                  resulting alerts. This panel keeps the chain visible with live data where possible and
                  resilient demo fallback where the backend is still catching up.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left sm:min-w-[24rem] xl:grid-cols-4">
                <MetricCard
                  label="Detections"
                  value={String(waveCDetection.previewEvents.length)}
                  detail={`${waveCDetection.activeOverlays.length} overlays active`}
                />
                <MetricCard
                  label="Incidents"
                  value={String(waveCOverview.incidentCounts.total)}
                  detail={`${waveCOverview.incidentCounts.open} open`}
                />
                <MetricCard
                  label="Policies"
                  value={String(waveCOverview.armedPolicies)}
                  detail={`${waveCOverview.totalZones} zones tracked`}
                />
                <MetricCard
                  label="Routes"
                  value={String(waveCOverview.routes)}
                  detail={waveCContext?.source === 'api' ? 'Live API mix' : 'Demo fallback'}
                />
              </div>
            </div>
          </div>

          {waveCError ? (
            <div className="border-b border-rose-400/20 bg-rose-400/10 px-6 py-3 text-sm text-rose-100 sm:px-8">
              {waveCError}
            </div>
          ) : null}

          {waveCNotice ? (
            <div className="border-b border-amber-400/20 bg-amber-400/10 px-6 py-3 text-sm text-amber-100 sm:px-8">
              {waveCNotice}
            </div>
          ) : null}

          <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.95fr)] xl:p-8">
            <div className="space-y-4 rounded-[2rem] border border-white/10 bg-slate-950/50 p-5 shadow-lg shadow-slate-950/30">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Detection Studio</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Overlay calibration and threshold tuning</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Preview the detection stack against the selected camera, tune thresholds, and keep zones and
                    overlays visible for operators and downstream event workers.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
                    {waveCStatus === 'loading'
                      ? 'Loading'
                      : waveCContext?.source === 'api'
                        ? 'API live'
                        : 'Demo fallback'}
                  </span>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                    {selectedWaveCZone?.name ?? 'Zone pending'}
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80">
                <div className="relative aspect-[16/10]">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-950 via-slate-950 to-slate-900" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,0.18),transparent_22%),radial-gradient(circle_at_75%_25%,rgba(16,185,129,0.18),transparent_20%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(2,6,23,0.82))]" />

                  <div className="absolute inset-x-4 top-4 flex flex-wrap gap-2">
                    {waveCOverlayOptions.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setWaveCOverlays((current) => ({
                            ...current,
                            [key]: !current[key],
                          }))
                        }
                        className={[
                          'rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] transition',
                          waveCOverlays[key]
                            ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-50'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                    <div className="max-w-lg">
                      <div className="text-xs uppercase tracking-[0.32em] text-slate-500">Detector preview</div>
                      <div className="mt-3 text-2xl font-semibold text-white">
                        {selectedCamera.name} · {waveCDetection.selectedZone?.name ?? 'No zone selected'}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {selectedCamera.detectionEnabled
                          ? 'Detection feed is active and ready for operator calibration.'
                          : 'Detection is currently disabled on this camera, but the studio remains ready for the next rollout.'}
                      </p>
                    </div>
                  </div>

                  <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        {waveCContext?.siteName ?? selectedCamera.site} · {selectedCamera.location}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {waveCDetection.confidence}% studio confidence · {waveCDetection.thresholdAverage}% threshold average
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-right">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Active overlays</div>
                      <div className="text-sm font-semibold text-white">{waveCDetection.activeOverlays.length}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label="Input FPS"
                  value={`${selectedCamera.fps} fps`}
                  detail={selectedCamera.detectionEnabled ? 'Detection feed enabled' : 'Detection feed disabled'}
                />
                <MetricCard
                  label="Model latency"
                  value={`${Math.max(24, Math.round(selectedCamera.latencyMs * 0.62))} ms`}
                  detail={selectedCamera.connectivity === 'stable' ? 'Edge inference steady' : 'Latency under review'}
                />
                <MetricCard
                  label="Queue depth"
                  value={String(waveCDetection.queueDepth)}
                  detail={`${waveCOverview.incidentCounts.open + waveCOverview.incidentCounts.investigating} incident signals`}
                />
                <MetricCard
                  label="Coverage"
                  value={`${waveCZones.length} zones`}
                  detail={waveCDetection.selectedZone ? waveCDetection.selectedZone.zone_type : 'Zone selection pending'}
                />
              </div>

              <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Thresholds</h4>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                      Tuning inputs for the next detection pass
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
                    {waveCDetection.queueDepth} queued
                  </span>
                </div>

                <div className="space-y-3">
                  {waveCThresholdOptions.map(({ key, label, hint }) => (
                    <label key={key} className="block rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-white">{label}</span>
                        <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{waveCThresholds[key]}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{hint}</p>
                      <input
                        type="range"
                        min={40}
                        max={95}
                        step={1}
                        value={waveCThresholds[key]}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          const input = event.currentTarget as unknown as { value: string };
                          setWaveCThresholds((current) => ({
                            ...current,
                            [key]: Number(input.value),
                          }));
                        }}
                        className="mt-3 w-full accent-cyan-400"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                      Detection signals
                    </h4>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                      Derived from camera, incident, and timeline context
                    </p>
                  </div>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                    Phase 5
                  </span>
                </div>

                <div className="space-y-2">
                  {waveCDetection.previewEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">{event.label}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {event.source}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', incidentSeverityTone(event.severity)].join(' ')}>
                            {event.severity}
                          </span>
                          <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{event.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[2rem] border border-white/10 bg-slate-950/50 p-5 shadow-lg shadow-slate-950/30">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Incident Inbox</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Review, triage, and inspect evidence</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Phase 6 assembles incident stories from raw events. The inbox below shows the current queue,
                    a focused detail view, and the evidence chain used by operators.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Open</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.incidentCounts.open}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Ack</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.incidentCounts.acknowledged}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Escalated</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.incidentCounts.escalated}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Critical</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.incidentCounts.critical}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {waveCIncidentViews.map(({ incident, cameraNames, policySummary }) => {
                  const isSelected = incident.id === selectedWaveCIncident?.id;

                  return (
                    <button
                      key={incident.id}
                      type="button"
                      onClick={() => setWaveCSelectedIncidentId(incident.id)}
                      className={[
                        'w-full rounded-3xl border px-4 py-4 text-left transition',
                        isSelected
                          ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', incidentSeverityTone(incident.severity)].join(' ')}>
                              {incident.severity}
                            </span>
                            <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', incidentStatusTone(incident.status)].join(' ')}>
                              {incident.status}
                            </span>
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">{incident.summary}</div>
                          <div className="mt-1 text-sm text-slate-400">
                            {incident.category} · {cameraNames.join(', ')}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-white">{Math.round(incident.confidence * 100)}%</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                            {formatTimelineWindow(incident.timeline_start, incident.timeline_end)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                          {policySummary}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                          {incident.escalation_state}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                {selectedWaveCIncident && selectedWaveCIncidentView ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Selected incident</div>
                        <h4 className="mt-2 text-lg font-semibold text-white">{selectedWaveCIncident.summary}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{selectedWaveCIncident.category}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', incidentSeverityTone(selectedWaveCIncident.severity)].join(' ')}>
                          {selectedWaveCIncident.severity}
                        </span>
                        <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', incidentStatusTone(selectedWaveCIncident.status)].join(' ')}>
                          {selectedWaveCIncident.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Timeline</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {formatTimelineWindow(selectedWaveCIncident.timeline_start, selectedWaveCIncident.timeline_end)}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">{selectedWaveCIncidentView.policySummary}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Confidence</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {Math.round(selectedWaveCIncident.confidence * 100)}%
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          Escalation state: {selectedWaveCIncident.escalation_state}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Evidence chain</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedWaveCIncidentView.evidence.map((evidence) => (
                          <div key={evidence.id} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className={['inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', evidenceTone(evidence.kind)].join(' ')}>
                                  {evidence.kind}
                                </div>
                                <div className="mt-2 text-sm font-semibold text-white">{evidence.label}</div>
                              </div>
                              <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', storageTone(evidence.status)].join(' ')}>
                                {storageLabel(evidence.status)}
                              </span>
                            </div>
                            <div className="mt-3 break-all text-sm text-slate-300">{evidence.ref}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-100/80">VLM enrichment</div>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-100">
                          {selectedPhase8IncidentEnrichments.length} enrichments
                        </span>
                      </div>
                      {selectedPhase8IncidentSummary ? (
                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-white">{selectedPhase8IncidentSummary.headline}</div>
                          <p className="text-sm leading-6 text-slate-200">{selectedPhase8IncidentSummary.summary}</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedPhase8IncidentSummary.cues.map((cue) => (
                              <span
                                key={cue}
                                className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                              >
                                {cue}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs uppercase tracking-[0.22em] text-emerald-100/80">
                            {selectedPhase8IncidentSummary.recommendation}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-emerald-400/20 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                          VLM enrichment is pending for the selected incident.
                        </div>
                      )}
                      {selectedPhase8IncidentEnrichments.length > 0 ? (
                        <div className="space-y-2 pt-1">
                          {selectedPhase8IncidentEnrichments.map((enrichment) => (
                            <div key={enrichment.id} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">{enrichment.headline}</div>
                                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                                    {enrichment.kind} · {enrichment.model}
                                  </div>
                                </div>
                                <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase8EnrichmentTone(enrichment.status)].join(' ')}>
                                  {enrichment.status}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-slate-300">{enrichment.summary}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {enrichment.cues.map((cue) => (
                                  <span
                                    key={cue}
                                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                                  >
                                    {cue}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Linked cameras</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedWaveCIncidentView.cameraNames.map((cameraName) => (
                          <span key={cameraName} className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                            {cameraName}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                    Select an incident to inspect its evidence chain.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-[2rem] border border-white/10 bg-slate-950/50 p-5 shadow-lg shadow-slate-950/30">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Policy / Alerting</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Policy state, routes, and escalation preview</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Phase 7 reads the incident stream, keeps alert routing visible, and previews the fan-out path
                    before a live escalation reaches the operator stack.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Armed</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.armedPolicies}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Routes</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.routes}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Zones</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.totalZones}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Open</div>
                    <div className="mt-1 text-base font-semibold text-white">{waveCOverview.incidentCounts.open}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {waveCPolicyViews.map(({ policy, scopeLabel }) => {
                  const isSelected = policy.id === selectedWaveCPolicy?.id;

                  return (
                    <button
                      key={policy.id}
                      type="button"
                      onClick={() => setWaveCSelectedPolicyId(policy.id)}
                      className={[
                        'w-full rounded-3xl border px-4 py-4 text-left transition',
                        isSelected
                          ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', policyStateTone(policy.enabled, policy.armed_state)].join(' ')}>
                              {policy.enabled ? policy.armed_state : 'disabled'}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                              {scopeLabel}
                            </span>
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">{policy.name}</div>
                          <div className="mt-1 text-sm text-slate-400">{policy.site_id ? 'Site scoped policy' : 'Tenant-wide policy'}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-white">{policy.enabled ? 'Enabled' : 'Disabled'}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                            {policy.armed_state}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                {selectedWaveCPolicyView ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Selected policy</div>
                        <h4 className="mt-2 text-lg font-semibold text-white">{selectedWaveCPolicyView.policy.name}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{selectedWaveCPolicyView.scopeLabel}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', policyStateTone(selectedWaveCPolicyView.policy.enabled, selectedWaveCPolicyView.policy.armed_state)].join(' ')}>
                          {selectedWaveCPolicyView.policy.enabled ? selectedWaveCPolicyView.policy.armed_state : 'disabled'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                          {selectedWaveCPolicyView.zoneCoverageLabel}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Conditions</div>
                        <div className="mt-2 text-sm font-semibold text-white">{selectedWaveCPolicyView.conditionSummary}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Schedule</div>
                        <div className="mt-2 text-sm font-semibold text-white">{selectedWaveCPolicyView.scheduleSummary}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 sm:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Severity rules</div>
                        <div className="mt-2 text-sm font-semibold text-white">{selectedWaveCPolicyView.severitySummary}</div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Zone coverage</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedWaveCPolicyView.zoneNames.map((zoneName) => (
                          <span key={zoneName} className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                            {zoneName}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Alert routes</div>
                      <div className="space-y-2">
                        {selectedWaveCPolicyView.routePreview.map((route) => (
                          <div key={route.id} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">{route.channel}</div>
                                <div className="mt-1 text-sm text-slate-400">{route.target}</div>
                              </div>
                              <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', routeStateTone(route.state)].join(' ')}>
                                {route.state}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-300">{route.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Escalation preview</div>
                      <div className="space-y-2">
                        {selectedWaveCPolicyView.escalationPreview.map((step, index) => (
                          <div key={`${selectedWaveCPolicyView.policy.id}-${index}`} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-[11px] font-semibold text-cyan-100">
                              {index + 1}
                            </div>
                            <p className="text-sm leading-6 text-slate-300">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                    Select a policy to inspect route fan-out and escalation behavior.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Phase 8 search and VLM enrichment</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Semantic search, result cards, and incident-level VLM context
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Search now spans incidents and media with natural language filters, while the selected incident
                  carries its VLM enrichment directly in context for faster operator review.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left sm:min-w-[24rem] xl:grid-cols-4">
                <MetricCard label="Results" value={String(phase8ResultStats.total)} detail="Semantic matches" />
                <MetricCard label="Incidents" value={String(phase8ResultStats.incident)} detail="Incident cards" />
                <MetricCard label="Media" value={String(phase8ResultStats.clip + phase8ResultStats.recording)} detail="Clip and recording cards" />
                <MetricCard label="VLM" value={String(phase8ResultStats.vlm)} detail={phase8Workspace?.source === 'api' ? 'API-backed context' : 'Fallback context'} />
              </div>
            </div>
          </div>

          {phase8Error ? (
            <div className="border-b border-rose-400/20 bg-rose-400/10 px-6 py-3 text-sm text-rose-100 sm:px-8">
              {phase8Error}
            </div>
          ) : null}

          {phase8Workspace ? (
            <div className="border-b border-white/10 bg-white/5 px-6 py-3 text-sm text-slate-300 sm:px-8">
              <span className="uppercase tracking-[0.24em] text-slate-500">Search scope</span>
              <span className="ml-3">{phase8Workspace.searchScopeLabel}</span>
              <span className="ml-3 rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                {phase8Workspace.source === 'api' ? 'API live' : 'Fallback index'}
              </span>
            </div>
          ) : null}

          <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:p-8">
            <div className="space-y-4 rounded-[2rem] border border-white/10 bg-slate-950/50 p-5 shadow-lg shadow-slate-950/30">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Search console</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Natural language filters and semantic matches</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Shape the query with operators in mind: find incidents, clips, or recordings, then narrow by
                    severity and whether the VLM summaries should be included.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
                    {phase8Status === 'loading' ? 'Loading' : phase8Workspace?.source === 'api' ? 'API live' : 'Demo fallback'}
                  </span>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                    {phase8Filters.vlmOnly ? 'VLM only' : 'All enrichments'}
                  </span>
                </div>
              </div>

              <label className="block rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Natural language search</div>
                <input
                  value={phase8Query}
                  onChange={(event) => {
                    const input = event.currentTarget as unknown as { value: string };
                    setPhase8Query(input.value);
                  }}
                  placeholder="Search incidents, clips, or VLM notes... e.g. after-hours person near entry"
                  className="mt-3 w-full border-0 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
                />
                <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                  Tip: start from the selected incident or camera context, then refine with severity and source.
                </p>
              </label>

              <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Filters</h4>
                  <button
                    type="button"
                    onClick={() => setPhase8Filters({ sourceType: 'all', severity: 'all', vlmOnly: false })}
                    className="text-xs uppercase tracking-[0.22em] text-cyan-200 underline decoration-cyan-200/40 underline-offset-4"
                  >
                    Reset
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    ['all', 'All'],
                    ['incident', 'Incidents'],
                    ['clip', 'Clips'],
                    ['recording', 'Recordings'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setPhase8Filters((current) => ({
                          ...current,
                          sourceType: value,
                        }))
                      }
                      className={[
                        'rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition',
                        phase8Filters.sourceType === value
                          ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-50'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    ['all', 'All severity'],
                    ['critical', 'Critical'],
                    ['high', 'High'],
                    ['medium', 'Medium'],
                    ['low', 'Low'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setPhase8Filters((current) => ({
                          ...current,
                          severity: value,
                        }))
                      }
                      className={[
                        'rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition',
                        phase8Filters.severity === value
                          ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-50'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPhase8Filters((current) => ({
                      ...current,
                      vlmOnly: !current.vlmOnly,
                    }))
                  }
                  className={[
                    'rounded-2xl border px-4 py-3 text-left transition',
                    phase8Filters.vlmOnly
                      ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-50'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]',
                  ].join(' ')}
                >
                  <div className="text-xs uppercase tracking-[0.24em] text-inherit">VLM summaries</div>
                  <div className="mt-1 text-sm font-medium text-inherit">
                    {phase8Filters.vlmOnly ? 'Only results with enrichment' : 'Include results without VLM notes'}
                  </div>
                </button>
              </div>

              <div className="space-y-2">
                {phase8Workspace?.suggestedQueries.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setPhase8Query(suggestion)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-xs uppercase tracking-[0.22em] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {phase8Results.map((result) => {
                  const isSelected = result.id === selectedPhase8Result?.id;

                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        setPhase8SelectedResultId(result.id);

                        if (result.kind === 'incident' && result.incidentId) {
                          setWaveCSelectedIncidentId(result.incidentId);
                        }

                        if ((result.kind === 'clip' || result.kind === 'recording') && result.timelineId) {
                          setSelectedTimelineId(result.timelineId);
                        }
                      }}
                      className={[
                        'w-full rounded-3xl border px-4 py-4 text-left transition',
                        isSelected
                          ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase8ResultTone(result.kind)].join(' ')}>
                              {result.kind}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                              {result.score}% score
                            </span>
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">{result.title}</div>
                          <div className="mt-1 text-sm text-slate-400">{result.subtitle}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-white">{result.confidence}%</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                            {result.sourceLabel}
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-slate-300">{result.summary}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {result.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}

                {phase8Results.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                    No semantic results matched the current search scope.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 rounded-[2rem] border border-white/10 bg-slate-950/50 p-5 shadow-lg shadow-slate-950/30">
              {selectedPhase8Result ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Selected result</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{selectedPhase8Result.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{selectedPhase8Result.subtitle}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase8ResultTone(selectedPhase8Result.kind)].join(' ')}>
                        {selectedPhase8Result.kind}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                        {selectedPhase8Result.confidence}% confidence
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Score</div>
                      <div className="mt-2 text-sm font-semibold text-white">{selectedPhase8Result.score}</div>
                      <div className="mt-1 text-sm text-slate-400">Source: {selectedPhase8Result.sourceLabel}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Linked context</div>
                      <div className="mt-2 text-sm font-semibold text-white">
                        {selectedPhase8Result.incidentId ? 'Incident-linked' : 'Media-only'}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {selectedPhase8Result.timelineId ?? 'No timeline binding'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Why it matched</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhase8Result.matchedTerms.length > 0 ? (
                        selectedPhase8Result.matchedTerms.map((term) => (
                          <span
                            key={term}
                            className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                          >
                            {term}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">This result was boosted by query semantics and incident context.</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">VLM summary</div>
                    {selectedPhase8Result.vlmSummary ? (
                      <p className="text-sm leading-6 text-slate-200">{selectedPhase8Result.vlmSummary}</p>
                    ) : (
                      <p className="text-sm leading-6 text-slate-400">No VLM summary was attached to this result.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhase8Result.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {selectedWaveCIncident ? (
                    <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-100/80">Incident context</div>
                      <div className="text-sm font-semibold text-white">{selectedWaveCIncident.summary}</div>
                      <p className="text-sm leading-6 text-slate-200">
                        {selectedPhase8IncidentSummary?.summary ?? 'The selected incident is ready to pick up an enrichment job.'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(selectedPhase8IncidentSummary?.cues ?? []).slice(0, 4).map((cue) => (
                          <span
                            key={cue}
                            className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                          >
                            {cue}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                  Select a search result to inspect the semantic match and its VLM context.
                </div>
              )}

              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Selected incident enrichments</div>
                {selectedPhase8IncidentEnrichments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedPhase8IncidentEnrichments.map((enrichment) => (
                      <div key={enrichment.id} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{enrichment.headline}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                              {enrichment.kind} · {enrichment.model}
                            </div>
                          </div>
                          <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase8EnrichmentTone(enrichment.status)].join(' ')}>
                            {enrichment.status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">{enrichment.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-5 text-sm text-slate-400">
                    Enrichment jobs will appear here once the search service returns incident-level results.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Wave D workspace</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Specialized Intelligence and Model Lifecycle in one workspace
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  LPR, Face, and Re-ID sit alongside annotation, training, and deployment so operators can move
                  from signals to rollout without leaving the live dashboard.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left sm:min-w-[32rem] xl:grid-cols-4">
                <MetricCard label="Signals" value={String(phase9Events.length)} detail="LPR, Face, Re-ID outputs" />
                <MetricCard label="Watchlists" value={String(phase9Watchlists.length)} detail="Subjects under review" />
                <MetricCard label="Annotations" value={String(phase9LifecycleAnnotations.length)} detail="Training-ready tasks" />
                <MetricCard label="Deployments" value={String(phase9LifecycleDeployments.length)} detail="Rollout targets" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                {phase9QueueLabel}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                {phase9Workspace?.integrationNote ?? 'Wave D workspace loading'}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                {phase9Workspace ? (phase9Workspace.source === 'api' ? 'API live' : 'Fallback mode') : 'Loading'}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
                {phase9Status === 'error' ? 'Wave D error' : phase9Status === 'loading' ? 'Wave D loading' : 'Wave D ready'}
              </div>
            </div>

            {phase9Error ? (
              <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                {phase9Error}
              </p>
            ) : null}
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:p-8">
            <section className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Specialized Intelligence</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">LPR, Face, and Re-ID review lane</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Identity-sensitive signals stay optional and visible as review-first cards instead of hidden API state.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-300">
                  {phase9Workspace ? (phase9Workspace.source === 'api' ? 'API live' : 'Fallback mode') : 'Loading'}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {phase9Modules.map((module) => {
                  const isSelected = module.id === selectedPhase9Module?.id;

                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => setPhase9SelectedModule(module.id)}
                      className={[
                        'rounded-3xl border px-4 py-4 text-left transition',
                        isSelected
                          ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{module.label}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {module.eventCount} signals
                          </div>
                        </div>
                        <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase9ModuleTone(module.id)].join(' ')}>
                          {module.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{module.summary}</p>
                      <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <span>Quality</span>
                        <span>{module.qualityScore}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedPhase9Module ? (
                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Selected module</div>
                      <div className="mt-1 text-lg font-semibold text-white">{selectedPhase9Module.label}</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{selectedPhase9Module.detail}</p>
                    </div>
                    <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase9ModuleTone(selectedPhase9Module.id)].join(' ')}>
                      {selectedPhase9Module.status}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Quality</div>
                      <div className="mt-2 text-sm font-semibold text-white">{selectedPhase9Module.qualityScore}%</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Signals</div>
                      <div className="mt-2 text-sm font-semibold text-white">{selectedPhase9Module.eventCount}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Watchlists</div>
                      <div className="mt-2 text-sm font-semibold text-white">{phase9WatchlistsForModule.length}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Last signal</div>
                      <div className="mt-2 text-sm font-semibold text-white">{formatRelativeTime(selectedPhase9Module.lastSignalAt)}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Review context</div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {selectedPhase9Watchlist ? selectedPhase9Watchlist.label : 'No watchlist selected'}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {selectedPhase9Watchlist?.signal ?? 'The current module has no watchlist signal yet.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {phase9WatchlistsForModule.slice(0, 3).map((entry) => (
                        <span
                          key={entry.id}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300"
                        >
                          {entry.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                  Select a module to inspect its watchlists and latest signals.
                </div>
              )}

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Recent signals</div>
                {phase9EventsForModule.length > 0 ? (
                  <div className="space-y-2">
                    {phase9EventsForModule.slice(0, 3).map((event) => (
                      <div key={event.id} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{event.title}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                              {formatRelativeTime(event.createdAt)} · {event.cameraName}
                            </div>
                          </div>
                          <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase9RiskTone(event.risk)].join(' ')}>
                            {event.reviewState}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">{event.subtitle}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-5 text-sm text-slate-400">
                    The module has no recent API signals, so fallback review items will appear here when needed.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Re-ID tracks</div>
                {phase9ReidTracks.length > 0 ? (
                  <div className="space-y-2">
                    {phase9ReidTracks.slice(0, 2).map((track) => (
                      <div key={track.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{track.label}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                              {track.cameras.join(' · ')}
                            </div>
                          </div>
                          <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase9TrackTone(track.status)].join(' ')}>
                            {track.status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">{track.movementHint}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-5 text-sm text-slate-400">
                    No linked tracks returned yet.
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Model Lifecycle</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Annotation, training, and deployment</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Phase 10 keeps the ML path explicit, from annotation tasks through rollout state and worker targets.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-300">
                  {phase9ModelLifecycle ? (phase9ModelLifecycle.source === 'api' ? 'API live' : 'Fallback mode') : 'Loading'}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {phase9LifecycleStages.map((stage) => (
                  <div key={stage.id} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{stage.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                          {stage.count} artifact{stage.count === 1 ? '' : 's'}
                        </div>
                      </div>
                      <span className={['rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]', phase10LifecycleTone(stage.status)].join(' ')}>
                        {stage.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{stage.summary}</p>
                    <div className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-500">{formatRelativeTime(stage.latestAt)}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Annotations</div>
                  <div className="mt-2 text-sm font-semibold text-white">{phase9LifecycleAnnotations.length}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Datasets</div>
                  <div className="mt-2 text-sm font-semibold text-white">{phase9LifecycleDatasets.length}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Training jobs</div>
                  <div className="mt-2 text-sm font-semibold text-white">{phase9LifecycleTrainingJobs.length}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Models</div>
                  <div className="mt-2 text-sm font-semibold text-white">{phase9LifecycleModels.length}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Latest artifacts</div>
                {phase9ModelLifecycle ? (
                  <div className="space-y-2">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {phase9LifecycleAnnotations[0]?.status ? `Annotation task ${phase9LifecycleAnnotations[0].status}` : 'Annotation tasks'}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {phase9LifecycleAnnotations[0]?.source_type ?? 'incident'} · {phase9LifecycleAnnotations[0]?.priority ?? 'medium'}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                          {phase9ModelLifecycle.summary.annotations} total
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {phase9LifecycleAnnotations[0]?.notes ?? 'Annotation review items are ready to seed a dataset.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {phase9LifecycleTrainingJobs[0]?.model_family ?? 'Training pipeline'}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {phase9LifecycleTrainingJobs[0]?.status ?? 'queued'} · {phase9LifecycleTrainingJobs[0]?.dataset_version_id ?? 'dataset pending'}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                          {phase9ModelLifecycle.summary.trainingJobs} total
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {phase9ModelLifecycle.integrationNote}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {phase9LifecycleDeployments[0]?.worker_type ?? 'Deployment target'}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {phase9LifecycleDeployments[0]?.status ?? 'staged'} · {phase9LifecycleDeployments[0]?.target_scope ?? 'global'}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                          {phase9ModelLifecycle.summary.deployments} total
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {phase9LifecycleModels[0]
                          ? `${phase9LifecycleModels[0].name} remains the current rollout candidate.`
                          : 'Deployment state is ready to receive a model artifact.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-5 text-sm text-slate-400">
                    Model lifecycle data will appear here once the ML overview responds.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
