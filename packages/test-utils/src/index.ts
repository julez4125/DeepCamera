import { randomUUID } from 'crypto';
import type {
  Tenant,
  Site,
  Camera,
  Detection,
  Enrichment,
  Event,
  Incident,
  SemanticSearchResult,
} from '@ainvr/contracts';

/**
 * Generate a deterministic test UUID with a given prefix
 * @param prefix - Prefix for the UUID (used for determinism in tests)
 * @returns A valid UUID string
 */
export function createTestId(prefix: string): string {
  // Generate a UUID, but for deterministic testing, you can
  // prepend the prefix in comments or use it as a seed reference
  // For now, we return a valid UUID
  return randomUUID();
}

/**
 * Create a valid Tenant object for testing
 * @param overrides - Partial properties to override defaults
 * @returns A valid Tenant object
 */
export function createTestTenant(overrides?: Partial<Tenant>): Tenant {
  const now = new Date().toISOString();
  const id = randomUUID() as any; // Brand as TenantId

  return {
    id,
    name: 'Test Tenant',
    slug: 'test-tenant',
    created_at: now as any,
    updated_at: now as any,
    ...overrides,
  };
}

/**
 * Create a valid Site object for testing
 * @param tenantId - Optional tenant ID (will be generated if not provided)
 * @param overrides - Partial properties to override defaults
 * @returns A valid Site object
 */
export function createTestSite(
  tenantId?: string,
  overrides?: Partial<Site>,
): Site {
  const now = new Date().toISOString();
  const finalTenantId = tenantId || (randomUUID() as any); // Brand as TenantId

  return {
    id: randomUUID() as any, // Brand as SiteId
    tenant_id: finalTenantId,
    name: 'Test Site',
    address: '123 Test Street, Test City, TC 12345',
    timezone: 'America/New_York',
    created_at: now as any,
    updated_at: now as any,
    ...overrides,
  };
}

/**
 * Create a valid Camera object for testing
 * @param siteId - Optional site ID (will be generated if not provided)
 * @param overrides - Partial properties to override defaults
 * @returns A valid Camera object
 */
export function createTestCamera(
  siteId?: string,
  overrides?: Partial<Camera>,
): Camera {
  const now = new Date().toISOString();
  const finalSiteId = siteId || (randomUUID() as any); // Brand as SiteId

  return {
    id: randomUUID() as any, // Brand as CameraId
    site_id: finalSiteId,
    name: 'Test Camera',
    stream_url: 'rtsp://test.example.com:554/stream',
    protocol: 'rtsp',
    status: 'online',
    detection_enabled: true,
    recording_enabled: true,
    created_at: now as any,
    updated_at: now as any,
    ...overrides,
  };
}

/**
 * Create a valid Event object for testing
 * @param cameraId - Optional camera ID (will be generated if not provided)
 * @param overrides - Partial properties to override defaults
 * @returns A valid Event object
 */
export function createTestEvent(
  cameraId?: string,
  overrides?: Partial<Event>,
): Event {
  const now = new Date().toISOString();
  const finalCameraId = cameraId || (randomUUID() as any); // Brand as CameraId

  return {
    id: randomUUID() as any, // Brand as EventId
    camera_id: finalCameraId,
    site_id: randomUUID() as any, // Brand as SiteId
    tenant_id: randomUUID() as any, // Brand as TenantId
    event_type: 'detection.created',
    timestamp: now as any,
    payload: { detected_objects: ['person', 'car'] },
    severity: 'medium',
    correlation_id: randomUUID(),
    created_at: now as any,
    ...overrides,
  };
}

export function createTestDetection(
  cameraId?: string,
  overrides?: Partial<Detection>,
): Detection {
  const now = new Date().toISOString();
  const finalCameraId = cameraId || (randomUUID() as any);

  return {
    id: randomUUID() as any,
    tenant_id: randomUUID() as any,
    site_id: randomUUID() as any,
    camera_id: finalCameraId,
    snapshot_id: null,
    clip_id: null,
    recording_id: null,
    label: 'person',
    confidence: 0.88,
    bounding_box: {
      x: 0.15,
      y: 0.12,
      width: 0.24,
      height: 0.46,
    },
    zone_ids: [],
    source: 'frame',
    model: 'detector-yolo-fallback',
    track_id: null,
    latency_ms: 24,
    frame_timestamp: now as any,
    created_at: now as any,
    ...overrides,
  };
}

/**
 * Create a valid Incident object for testing
 * @param siteId - Optional site ID (will be generated if not provided)
 * @param overrides - Partial properties to override defaults
 * @returns A valid Incident object
 */
export function createTestIncident(
  siteId?: string,
  overrides?: Partial<Incident>,
): Incident {
  const now = new Date().toISOString();
  const finalSiteId = siteId || (randomUUID() as any); // Brand as SiteId

  return {
    id: randomUUID() as any, // Brand as IncidentId
    tenant_id: randomUUID() as any, // Brand as TenantId
    site_id: finalSiteId,
    severity: 'high',
    confidence: 0.92,
    category: 'intrusion',
    summary: 'Potential intrusion detected at main entrance',
    status: 'open',
    camera_ids: [randomUUID() as any], // Brand as CameraId
    timeline_start: now as any,
    timeline_end: now as any,
    policy_hits: { 'restricted-zone': true },
    escalation_state: 'scheduled',
    linked_event_ids: [randomUUID() as any],
    evidence_references: [],
    dedupe_count: 1,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: now as any,
    updated_at: now as any,
    ...overrides,
  };
}

export function createTestEnrichment(
  tenantId?: string,
  overrides?: Partial<Enrichment>,
): Enrichment {
  const now = new Date().toISOString();
  const finalTenantId = tenantId || (randomUUID() as any);

  return {
    id: randomUUID() as any,
    tenant_id: finalTenantId,
    source_type: 'incident',
    source_id: randomUUID(),
    incident_id: randomUUID() as any,
    event_id: null,
    clip_id: null,
    snapshot_id: null,
    recording_id: null,
    status: 'completed',
    model: 'vlm-fallback-v1',
    summary: 'A person is visible near a restricted entrance after hours.',
    suspicious_context: ['after_hours'],
    keywords: ['person', 'intrusion'],
    semantic_terms: ['person', 'intrusion', 'unauthorized'],
    queued_at: now as any,
    started_at: now as any,
    completed_at: now as any,
    error_message: null,
    created_at: now as any,
    updated_at: now as any,
    ...overrides,
  };
}

export function createTestSemanticSearchResult(
  siteId?: string,
  overrides?: Partial<SemanticSearchResult>,
): SemanticSearchResult {
  const now = new Date().toISOString();
  const finalSiteId = siteId || (randomUUID() as any);

  return {
    id: randomUUID() as any,
    tenant_id: randomUUID() as any,
    site_id: finalSiteId,
    source_type: 'incident',
    source_id: randomUUID(),
    incident_id: randomUUID() as any,
    event_id: null,
    clip_id: null,
    camera_ids: [randomUUID() as any],
    severity: 'high',
    title: 'High severity intrusion incident',
    summary: 'Unauthorized person detected near a restricted entrance.',
    occurred_at: now as any,
    keywords: ['intrusion', 'person'],
    semantic_terms: ['intrusion', 'unauthorized', 'person'],
    matched_terms: ['intrusion'],
    score: 0.78,
    vlm_summary: 'The clip shows a person crossing the boundary line.',
    suspicious_context: ['restricted_zone'],
    created_at: now as any,
    updated_at: now as any,
    ...overrides,
  };
}
