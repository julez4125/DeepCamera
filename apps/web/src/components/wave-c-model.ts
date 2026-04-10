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

export type WaveCSource = 'api' | 'fallback';
export type WaveCPart = 'incidents' | 'policies' | 'zones';
export type WaveCOverlayKey = 'boxes' | 'labels' | 'tracks' | 'zones' | 'heatmap' | 'timestamps';
export type WaveCThresholdKey = 'person' | 'vehicle' | 'loitering';

export type WaveCIncident = {
  id: string;
  tenant_id: string;
  site_id: string;
  severity: string;
  confidence: number;
  category: string;
  summary: string;
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'closed';
  camera_ids: string[];
  timeline_start: string;
  timeline_end: string;
  policy_hits: Record<string, unknown>;
  escalation_state: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WaveCPolicy = {
  id: string;
  tenant_id: string;
  site_id: string | null;
  name: string;
  conditions: Record<string, unknown>;
  schedule: Record<string, unknown>;
  severity_rules: Record<string, unknown>;
  enabled: boolean;
  armed_state: 'armed' | 'disarmed' | 'partial';
  created_at: string;
  updated_at: string;
};

export type WaveCZone = {
  id: string;
  site_id: string;
  name: string;
  polygon: Record<string, unknown>;
  zone_type: 'entry' | 'restricted' | 'restricted_zone';
  created_at: string;
  updated_at: string;
};

export type WaveCRouteState = 'active' | 'testing' | 'paused';

export type WaveCRoute = {
  id: string;
  channel: 'webhook' | 'slack' | 'email' | 'telegram' | 'discord';
  target: string;
  state: WaveCRouteState;
  note: string;
};

export type WaveCEvidence = {
  id: string;
  label: string;
  kind: 'camera' | 'clip' | 'recording' | 'snapshot' | 'log';
  ref: string;
  status: 'local_only' | 'replicating' | 'replicated' | 'degraded' | 'missing';
};

export type WaveCContext = {
  source: WaveCSource;
  partialFallbacks: WaveCPart[];
  siteName: string;
  cameraName: string;
  incidents: WaveCIncident[];
  policies: WaveCPolicy[];
  zones: WaveCZone[];
  updatedAt: string;
};

export type WaveCLoadParams = {
  token: string;
  siteId: string;
  siteName: string;
  cameraId: string;
  cameraName: string;
  signal?: AbortSignal;
};

async function fetchJson<T>(path: string, token: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(path, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as ApiEnvelope<T>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

function fetchPageData<T>(page: ApiPage<T> | null, fallback: T[]): T[] {
  return page?.data?.length ? page.data : fallback;
}

function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function summarizeRecord(record: Record<string, unknown>): string {
  const parts = Object.entries(record).flatMap(([key, value]) => {
    if (value === null || value === undefined) {
      return [];
    }

    if (typeof value === 'boolean') {
      return [`${key}:${value ? 'on' : 'off'}`];
    }

    if (typeof value === 'number' || typeof value === 'string') {
      return [`${key}:${value}`];
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? [`${key}(${value.length})`] : [];
    }

    return [key];
  });

  return parts.length > 0 ? parts.join(' · ') : 'No conditions';
}

function buildRoutePreview(policy: WaveCPolicy): WaveCRoute[] {
  const active = policy.enabled && policy.armed_state !== 'disarmed';
  const primaryState: WaveCRouteState = active ? 'active' : 'paused';
  const secondaryState: WaveCRouteState = policy.armed_state === 'partial' ? 'testing' : primaryState;

  return [
    {
      id: `${policy.id}-webhook`,
      channel: 'webhook',
      target: 'SOC webhook',
      state: primaryState,
      note: active ? 'Primary policy fan-out is armed.' : 'Route is muted while the policy stays disarmed.',
    },
    {
      id: `${policy.id}-slack`,
      channel: 'slack',
      target: '#security-ops',
      state: secondaryState,
      note: policy.armed_state === 'partial' ? 'Preview routing is still under operator review.' : 'Chat escalation remains on standby.',
    },
    {
      id: `${policy.id}-email`,
      channel: 'email',
      target: 'security-oncall@ainvr.local',
      state: active ? 'active' : 'paused',
      note: 'Secondary route remains visible in the escalation chain.',
    },
  ];
}

function buildEscalationPreview(policy: WaveCPolicy): string[] {
  const baseSteps = [
    'Match detection conditions against the policy',
    'Create an incident with linked evidence',
    'Route to the primary notification target',
    'Wait for acknowledgement or timeout',
    'Escalate to the alternate route and audit trail',
  ];

  if (!policy.enabled) {
    return ['Policy is disabled, so no alert fan-out is emitted until it is re-armed.'];
  }

  if (policy.armed_state === 'partial') {
    return ['Policy is partially armed, so routing is preview-only until the operator confirms the target set.'];
  }

  return baseSteps;
}

function buildIncidentEvidence(incident: WaveCIncident): WaveCEvidence[] {
  const timelineLabel = `${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(incident.timeline_start))} - ${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(incident.timeline_end))}`;

  return [
    {
      id: `${incident.id}-timeline`,
      label: 'Timeline window',
      kind: 'log',
      ref: timelineLabel,
      status: 'replicated',
    },
    {
      id: `${incident.id}-cameras`,
      label: 'Linked cameras',
      kind: 'camera',
      ref: `${incident.camera_ids.length} camera${incident.camera_ids.length === 1 ? '' : 's'}`,
      status: 'local_only',
    },
    {
      id: `${incident.id}-policy`,
      label: 'Policy hits',
      kind: 'snapshot',
      ref: summarizeRecord(incident.policy_hits),
      status: 'replicating',
    },
  ];
}

function buildFallbackIncidents(siteId: string, cameraId: string): WaveCIncident[] {
  return [
    {
      id: '550e8400-e29b-41d4-a716-446655441101',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      site_id: siteId,
      severity: 'high',
      confidence: 0.94,
      category: 'intrusion',
      summary: 'Person entered a restricted perimeter after hours',
      status: 'open',
      camera_ids: [cameraId],
      timeline_start: '2024-01-01T10:02:00Z',
      timeline_end: '2024-01-01T10:05:00Z',
      policy_hits: {
        motion: 'high',
        after_hours: true,
      },
      escalation_state: 'none',
      acknowledged_by: null,
      acknowledged_at: null,
      created_at: '2024-01-01T10:05:00Z',
      updated_at: '2024-01-01T10:05:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655441102',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      site_id: siteId,
      severity: 'medium',
      confidence: 0.81,
      category: 'loitering',
      summary: 'Repeated dwell observed near the lobby entry',
      status: 'acknowledged',
      camera_ids: [cameraId],
      timeline_start: '2024-01-01T09:48:00Z',
      timeline_end: '2024-01-01T09:54:00Z',
      policy_hits: {
        dwell: 'elevated',
        zone: 'lobby',
      },
      escalation_state: 'escalated',
      acknowledged_by: '550e8400-e29b-41d4-a716-446655440777',
      acknowledged_at: '2024-01-01T09:54:30Z',
      created_at: '2024-01-01T09:54:30Z',
      updated_at: '2024-01-01T09:56:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655441103',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      site_id: siteId,
      severity: 'critical',
      confidence: 0.98,
      category: 'tailgating',
      summary: 'Multiple entrants crossed the loading gate together',
      status: 'investigating',
      camera_ids: [cameraId],
      timeline_start: '2024-01-01T11:03:00Z',
      timeline_end: '2024-01-01T11:07:00Z',
      policy_hits: {
        tailgate: true,
        escalation: 'critical',
      },
      escalation_state: 'critical',
      acknowledged_by: null,
      acknowledged_at: null,
      created_at: '2024-01-01T11:07:00Z',
      updated_at: '2024-01-01T11:07:00Z',
    },
  ];
}

function buildFallbackPolicies(siteId: string): WaveCPolicy[] {
  return [
    {
      id: '550e8400-e29b-41d4-a716-446655441201',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      site_id: siteId,
      name: 'After-hours perimeter',
      conditions: {
        motion: true,
        after_hours: true,
        zones: ['entry'],
      },
      schedule: {
        timezone: 'Europe/Zurich',
        active_window: '18:00-06:00',
      },
      severity_rules: {
        intrusion: 'critical',
      },
      enabled: true,
      armed_state: 'armed',
      created_at: '2024-01-01T09:00:00Z',
      updated_at: '2024-01-01T09:00:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655441202',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      site_id: siteId,
      name: 'Lobby dwell monitor',
      conditions: {
        dwell_seconds: 40,
        zones: ['lobby'],
      },
      schedule: {
        timezone: 'Europe/Zurich',
        active_window: 'all-day',
      },
      severity_rules: {
        loitering: 'medium',
      },
      enabled: true,
      armed_state: 'partial',
      created_at: '2024-01-01T09:10:00Z',
      updated_at: '2024-01-01T09:12:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655441203',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      site_id: siteId,
      name: 'Loading bay escalation',
      conditions: {
        cameras: ['loading-dock'],
        tailgate: true,
      },
      schedule: {
        timezone: 'Europe/Zurich',
        active_window: 'work-hours',
      },
      severity_rules: {
        tailgate: 'critical',
      },
      enabled: false,
      armed_state: 'disarmed',
      created_at: '2024-01-01T09:20:00Z',
      updated_at: '2024-01-01T09:22:00Z',
    },
  ];
}

function buildFallbackZones(siteId: string): WaveCZone[] {
  return [
    {
      id: '550e8400-e29b-41d4-a716-446655441301',
      site_id: siteId,
      name: 'North Entry',
      polygon: { points: [1, 2, 3, 4] },
      zone_type: 'entry',
      created_at: '2024-01-01T08:45:00Z',
      updated_at: '2024-01-01T08:45:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655441302',
      site_id: siteId,
      name: 'Lobby Core',
      polygon: { points: [5, 6, 7, 8] },
      zone_type: 'restricted_zone',
      created_at: '2024-01-01T08:45:00Z',
      updated_at: '2024-01-01T08:45:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655441303',
      site_id: siteId,
      name: 'Loading Dock',
      polygon: { points: [9, 10, 11, 12] },
      zone_type: 'restricted',
      created_at: '2024-01-01T08:45:00Z',
      updated_at: '2024-01-01T08:45:00Z',
    },
  ];
}

export function summarizePolicyConditions(policy: WaveCPolicy): string {
  return summarizeRecord(policy.conditions);
}

export function summarizePolicySchedule(policy: WaveCPolicy): string {
  return summarizeRecord(policy.schedule);
}

export function summarizePolicySeverity(policy: WaveCPolicy): string {
  return summarizeRecord(policy.severity_rules);
}

export function buildPolicyRoutes(policy: WaveCPolicy): WaveCRoute[] {
  return buildRoutePreview(policy);
}

export function buildPolicyEscalationPreview(policy: WaveCPolicy): string[] {
  return buildEscalationPreview(policy);
}

export function buildIncidentEvidencePreview(incident: WaveCIncident): WaveCEvidence[] {
  return buildIncidentEvidence(incident);
}

export function buildZoneCoverageLabel(zone: WaveCZone, index: number): string {
  const labels = ['Primary capture lane', 'Secondary overlap lane', 'Fallback guard lane'];
  return labels[index % labels.length] ?? `${zone.name} coverage`;
}

export async function loadWaveCContext({
  token,
  siteId,
  siteName,
  cameraId,
  cameraName,
  signal,
}: WaveCLoadParams): Promise<WaveCContext> {
  const [incidentsPage, policiesPage, zonesPage] = await Promise.all([
    fetchJson<ApiPage<WaveCIncident>>(`/api/incidents?site_id=${siteId}&page=1&pageSize=8`, token, signal),
    fetchJson<ApiPage<WaveCPolicy>>(`/api/policies?site_id=${siteId}&page=1&pageSize=8`, token, signal),
    fetchJson<ApiPage<WaveCZone>>(`/api/sites/${siteId}/zones?page=1&pageSize=8`, token, signal),
  ]);

  const fallback = {
    incidents: buildFallbackIncidents(siteId, cameraId),
    policies: buildFallbackPolicies(siteId),
    zones: buildFallbackZones(siteId),
  };

  const incidents = sortByCreatedAtDesc(fetchPageData(incidentsPage, fallback.incidents));
  const policies = sortByCreatedAtDesc(fetchPageData(policiesPage, fallback.policies));
  const zones = sortByCreatedAtDesc(fetchPageData(zonesPage, fallback.zones));

  const partialFallbacks: WaveCPart[] = [];
  if (incidentsPage === null || incidents.length === 0) {
    partialFallbacks.push('incidents');
  }
  if (policiesPage === null || policies.length === 0) {
    partialFallbacks.push('policies');
  }
  if (zonesPage === null || zones.length === 0) {
    partialFallbacks.push('zones');
  }

  return {
    source: partialFallbacks.length === 3 ? 'fallback' : 'api',
    partialFallbacks,
    siteName,
    cameraName,
    incidents,
    policies,
    zones,
    updatedAt: new Date().toISOString(),
  };
}
