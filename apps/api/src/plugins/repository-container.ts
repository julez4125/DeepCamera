import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type {
  AnnotationTaskRecord,
  AlertRoute,
  AuditLog,
  Camera,
  Clip,
  DatasetVersionRecord,
  EnrichmentRecord,
  EventRecord,
  FaceMatchRecord,
  IdentityProfileRecord,
  Incident,
  ModelDeploymentRecord,
  ModelRegistryEntryRecord,
  PlateReadRecord,
  Policy,
  ReIdTrackLinkRecord,
  Recording,
  SearchDocument,
  Site,
  Snapshot,
  StorageObjectCopy,
  Tenant,
  Stream,
  StoragePolicyAssignment,
  StorageReplicationJob,
  StorageTarget,
  TrainingJobRecord,
  WatchlistRecord,
  Zone,
} from '../db/repositories/index.js';

interface PaginationOptions {
  limit?: number;
  offset?: number;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

function paginate<T>(
  items: T[],
  pagination: PaginationOptions = {}
): PaginatedResult<T> {
  const limit = pagination.limit ?? 100;
  const offset = pagination.offset ?? 0;

  return {
    data: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  };
}

const fixtureRoot = join(tmpdir(), 'ainvr-api-media-fixtures');

function ensureFixtureFile(relativePath: string, contents: string): string {
  const filePath = join(fixtureRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });

  if (!existsSync(filePath)) {
    writeFileSync(filePath, contents);
  }

  return filePath;
}

function asId<T extends string>(value: string): T {
  return value as T;
}

export default fp(async (fastify: FastifyInstance): Promise<void> => {
  const frontDoorRecordingPath = ensureFixtureFile(
    'recordings/front-door/2024-01-01T09-55-00.mp4',
    'front-door-recording'
  );
  const incidentRecordingPath = ensureFixtureFile(
    'recordings/incident-camera/2024-01-01T10-00-00.mp4',
    'incident-recording'
  );
  const frontDoorClipPath = ensureFixtureFile('clips/front-door/clip-001.mp4', 'front-door-clip');
  const incidentClipPath = ensureFixtureFile(
    'clips/incident-camera/clip-002.mp4',
    'incident-clip'
  );
  const frontDoorThumbnailPath = ensureFixtureFile(
    'clips/front-door/clip-001.jpg',
    'front-door-thumbnail'
  );
  const incidentThumbnailPath = ensureFixtureFile(
    'clips/incident-camera/clip-002.jpg',
    'incident-thumbnail'
  );
  const tenantTwoNfsRoot = join(fixtureRoot, 'mounted-targets', 'tenant-two-nfs');
  const tenantTwoSmbRoot = join(fixtureRoot, 'mounted-targets', 'tenant-two-smb');
  const tenantTwoS3Root = join(fixtureRoot, 'remote-targets', 'tenant-two-s3');
  mkdirSync(tenantTwoNfsRoot, { recursive: true });
  mkdirSync(tenantTwoSmbRoot, { recursive: true });
  mkdirSync(tenantTwoS3Root, { recursive: true });

  const tenants = new Map<string, Tenant>([
    [
      '550e8400-e29b-41d4-a716-446655440001',
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Tenant One',
        slug: 'tenant-one',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440002',
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Tenant Two',
        slug: 'tenant-two',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const sites = new Map<string, Site>([
    [
      '550e8400-e29b-41d4-a716-446655440000',
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test Site',
        address: '123 Main St',
        timezone: 'America/New_York',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440001',
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Operations Site',
        address: '456 Security Ave',
        timezone: 'America/New_York',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const cameras = new Map<string, Camera>([
    [
      '550e8400-e29b-41d4-a716-446655440000',
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Front Door',
        stream_url: 'rtsp://192.168.1.100:554/stream',
        protocol: 'rtsp',
        status: 'online',
        detection_enabled: true,
        recording_enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440003',
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Incident Camera',
        stream_url: 'rtsp://192.168.1.103:554/stream',
        protocol: 'rtsp',
        status: 'online',
        detection_enabled: true,
        recording_enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const zones = new Map<string, Zone>([
    [
      '550e8400-e29b-41d4-a716-446655440101',
      {
        id: '550e8400-e29b-41d4-a716-446655440101',
        site_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Front Entrance',
        polygon: { points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
        zone_type: 'entry',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440102',
      {
        id: '550e8400-e29b-41d4-a716-446655440102',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Operations Entrance',
        polygon: { points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
        zone_type: 'entry',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const streams = new Map<string, Stream>([
    [
      '550e8400-e29b-41d4-a716-446655440201',
      {
        id: '550e8400-e29b-41d4-a716-446655440201',
        camera_id: '550e8400-e29b-41d4-a716-446655440000',
        stream_type: 'main',
        url: 'rtsp://192.168.1.100:554/stream',
        active: true,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440202',
      {
        id: '550e8400-e29b-41d4-a716-446655440202',
        camera_id: '550e8400-e29b-41d4-a716-446655440003',
        stream_type: 'main',
        url: 'rtsp://192.168.1.103:554/stream',
        active: true,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const recordings = new Map<string, Recording>([
    [
      '550e8400-e29b-41d4-a716-446655440801',
      {
        id: '550e8400-e29b-41d4-a716-446655440801',
        camera_id: '550e8400-e29b-41d4-a716-446655440000',
        start_time: '2024-01-01T09:55:00Z',
        end_time: '2024-01-01T10:10:00Z',
        file_path: frontDoorRecordingPath,
        file_size: 73400320,
        recording_mode: 'continuous',
        created_at: '2024-01-01T10:10:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440802',
      {
        id: '550e8400-e29b-41d4-a716-446655440802',
        camera_id: '550e8400-e29b-41d4-a716-446655440003',
        start_time: '2024-01-01T10:00:00Z',
        end_time: '2024-01-01T10:15:00Z',
        file_path: incidentRecordingPath,
        file_size: 68157440,
        recording_mode: 'motion',
        created_at: '2024-01-01T10:15:00Z',
      },
    ],
  ]);

  const clips = new Map<string, Clip>([
    [
      '550e8400-e29b-41d4-a716-446655440901',
      {
        id: '550e8400-e29b-41d4-a716-446655440901',
        camera_id: '550e8400-e29b-41d4-a716-446655440000',
        recording_id: '550e8400-e29b-41d4-a716-446655440801',
        start_time: '2024-01-01T10:01:00Z',
        end_time: '2024-01-01T10:03:00Z',
        file_path: frontDoorClipPath,
        file_size: 15728640,
        thumbnail_path: frontDoorThumbnailPath,
        metadata: {
          duration_seconds: 120,
          status: 'local_only',
        },
        created_at: '2024-01-01T10:03:30Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440902',
      {
        id: '550e8400-e29b-41d4-a716-446655440902',
        camera_id: '550e8400-e29b-41d4-a716-446655440003',
        recording_id: '550e8400-e29b-41d4-a716-446655440802',
        start_time: '2024-01-01T10:04:00Z',
        end_time: '2024-01-01T10:05:00Z',
        file_path: incidentClipPath,
        file_size: 9437184,
        thumbnail_path: incidentThumbnailPath,
        metadata: {
          duration_seconds: 60,
          status: 'replicated',
        },
        created_at: '2024-01-01T10:05:20Z',
      },
    ],
  ]);

  const incidents = new Map<string, Incident>([
    [
      '550e8400-e29b-41d4-a716-446655440000',
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        severity: 'high',
        confidence: 0.95,
        category: 'intrusion',
        summary: 'Unauthorized person detected',
        status: 'open',
        camera_ids: ['550e8400-e29b-41d4-a716-446655440003'],
        timeline_start: '2024-01-01T10:00:00Z',
        timeline_end: '2024-01-01T10:05:00Z',
        policy_hits: {
          '550e8400-e29b-41d4-a716-446655440602': {
            name: 'Ops Intrusion Guard',
            severity: 'high',
            matched_labels: ['person'],
            matched_zone_ids: ['550e8400-e29b-41d4-a716-446655440102'],
          },
        },
        escalation_state: 'scheduled',
        linked_event_ids: ['550e8400-e29b-41d4-a716-446655440551'],
        evidence_references: [
          {
            kind: 'clip',
            snapshot_id: null,
            clip_id: '550e8400-e29b-41d4-a716-446655440902',
            recording_id: null,
            path: incidentClipPath,
            preview_url: incidentThumbnailPath,
            playback_url: '/api/media/clips/550e8400-e29b-41d4-a716-446655440902/playback',
          },
        ],
        dedupe_count: 1,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      },
    ],
  ]);

  const policies = new Map<string, Policy>([
    [
      '550e8400-e29b-41d4-a716-446655440601',
      {
        id: '550e8400-e29b-41d4-a716-446655440601',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        site_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Perimeter Watch',
        conditions: {
          motion: true,
          zones: ['entry'],
          object_classes: ['person'],
          ack_timeout_seconds: 60,
        },
        schedule: {
          mode: '24x7',
        },
        severity_rules: {
          motion: 'high',
          person: 'high',
          default: 'medium',
        },
        enabled: true,
        armed_state: 'armed',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const events = new Map<string, EventRecord>([
    [
      '550e8400-e29b-41d4-a716-446655440551',
      {
        id: '550e8400-e29b-41d4-a716-446655440551',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        camera_id: '550e8400-e29b-41d4-a716-446655440003',
        event_type: 'detection.created',
        timestamp: '2024-01-01T10:00:00Z',
        severity: 'high',
        correlation_id: '550e8400-e29b-41d4-a716-446655440552',
        payload: {
          detections: [
            {
              label: 'person',
              confidence: 0.95,
              bounding_box: {
                x: 0.12,
                y: 0.2,
                width: 0.26,
                height: 0.44,
              },
              zone_ids: ['550e8400-e29b-41d4-a716-446655440102'],
            },
          ],
          clip_id: '550e8400-e29b-41d4-a716-446655440902',
          snapshot_id: null,
          recording_id: '550e8400-e29b-41d4-a716-446655440802',
          model: 'detector-yolo-fallback',
          processing_ms: 32,
          fps: 8,
          policy_matches: [
            {
              policy_id: '550e8400-e29b-41d4-a716-446655440602',
              policy_name: 'Ops Intrusion Guard',
              severity: 'high',
              matched_labels: ['person'],
              matched_zone_ids: ['550e8400-e29b-41d4-a716-446655440102'],
            },
          ],
        },
        created_at: '2024-01-01T10:00:00Z',
      },
    ],
  ]);

  const enrichments = new Map<string, EnrichmentRecord>([
    [
      '550e8400-e29b-41d4-a716-446655440751',
      {
        id: '550e8400-e29b-41d4-a716-446655440751',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        source_type: 'incident',
        source_id: '550e8400-e29b-41d4-a716-446655440000',
        incident_id: '550e8400-e29b-41d4-a716-446655440000',
        event_id: '550e8400-e29b-41d4-a716-446655440551',
        clip_id: '550e8400-e29b-41d4-a716-446655440902',
        snapshot_id: null,
        recording_id: '550e8400-e29b-41d4-a716-446655440802',
        status: 'completed',
        model: 'vlm-fallback-v1',
        summary:
          'A person moves through the operations entrance after hours, and the attached clip suggests deliberate entry rather than a transient false alarm.',
        suspicious_context: ['after_hours', 'restricted_zone', 'clip_evidence', 'recording_available'],
        keywords: ['person', 'intrusion', 'after_hours', 'operations entrance', 'clip'],
        semantic_terms: ['person', 'human', 'intrusion', 'unauthorized', 'after_hours', 'clip'],
        queued_at: '2024-01-01T10:00:05Z',
        started_at: '2024-01-01T10:00:06Z',
        completed_at: '2024-01-01T10:00:08Z',
        error_message: null,
        created_at: '2024-01-01T10:00:05Z',
        updated_at: '2024-01-01T10:00:08Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440752',
      {
        id: '550e8400-e29b-41d4-a716-446655440752',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        source_type: 'event',
        source_id: '550e8400-e29b-41d4-a716-446655440551',
        incident_id: null,
        event_id: '550e8400-e29b-41d4-a716-446655440551',
        clip_id: '550e8400-e29b-41d4-a716-446655440902',
        snapshot_id: null,
        recording_id: '550e8400-e29b-41d4-a716-446655440802',
        status: 'queued',
        model: 'vlm-fallback-v1',
        summary: null,
        suspicious_context: [],
        keywords: [],
        semantic_terms: [],
        queued_at: '2024-01-01T10:00:09Z',
        started_at: null,
        completed_at: null,
        error_message: null,
        created_at: '2024-01-01T10:00:09Z',
        updated_at: '2024-01-01T10:00:09Z',
      },
    ],
  ]);

  const searchDocuments = new Map<string, SearchDocument>([
    [
      '550e8400-e29b-41d4-a716-446655440761',
      {
        id: '550e8400-e29b-41d4-a716-446655440761',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        source_type: 'incident',
        source_id: '550e8400-e29b-41d4-a716-446655440000',
        incident_id: '550e8400-e29b-41d4-a716-446655440000',
        event_id: '550e8400-e29b-41d4-a716-446655440551',
        clip_id: '550e8400-e29b-41d4-a716-446655440902',
        camera_ids: ['550e8400-e29b-41d4-a716-446655440003'],
        severity: 'high',
        title: 'HIGH intrusion incident',
        summary: 'Unauthorized person detected at the operations entrance.',
        occurred_at: '2024-01-01T10:00:00Z',
        keywords: ['person', 'intrusion', 'operations', 'after_hours'],
        semantic_terms: ['person', 'human', 'intrusion', 'unauthorized', 'after_hours', 'operations'],
        matched_terms: [],
        score: 0,
        vlm_summary:
          'A person moves through the operations entrance after hours, and the attached clip suggests deliberate entry rather than a transient false alarm.',
        suspicious_context: ['after_hours', 'restricted_zone'],
        created_at: '2024-01-01T10:00:08Z',
        updated_at: '2024-01-01T10:00:08Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440762',
      {
        id: '550e8400-e29b-41d4-a716-446655440762',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        site_id: '550e8400-e29b-41d4-a716-446655440001',
        source_type: 'clip',
        source_id: '550e8400-e29b-41d4-a716-446655440902',
        incident_id: '550e8400-e29b-41d4-a716-446655440000',
        event_id: '550e8400-e29b-41d4-a716-446655440551',
        clip_id: '550e8400-e29b-41d4-a716-446655440902',
        camera_ids: ['550e8400-e29b-41d4-a716-446655440003'],
        severity: 'high',
        title: 'Clip evidence from Incident Camera',
        summary:
          'Clip evidence associated with the operations entrance intrusion, including after-hours movement.',
        occurred_at: '2024-01-01T10:04:00Z',
        keywords: ['clip', 'intrusion', 'person', 'evidence'],
        semantic_terms: ['clip', 'video', 'intrusion', 'person', 'unauthorized', 'evidence'],
        matched_terms: [],
        score: 0,
        vlm_summary:
          'The clip shows a person crossing the restricted entrance line and continuing deeper into the scene.',
        suspicious_context: ['clip_evidence', 'restricted_zone'],
        created_at: '2024-01-01T10:00:08Z',
        updated_at: '2024-01-01T10:00:08Z',
      },
    ],
  ]);

  const watchlists = new Map<string, WatchlistRecord>([
    [
      '550e8400-e29b-41d4-a716-446655440771',
      {
        id: '550e8400-e29b-41d4-a716-446655440771',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        kind: 'plate',
        name: 'Denied Vehicle Watchlist',
        description: 'Vehicles that should trigger immediate review at perimeter gates.',
        disposition: 'deny',
        severity: 'critical',
        enabled: true,
        entries: ['OPS-2471'],
        tags: ['after_hours', 'gate'],
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      } as WatchlistRecord,
    ],
    [
      '550e8400-e29b-41d4-a716-446655440772',
      {
        id: '550e8400-e29b-41d4-a716-446655440772',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        kind: 'face',
        name: 'Person of Interest',
        description: 'Opt-in and watchlisted identities that warrant operator confirmation.',
        disposition: 'interest',
        severity: 'high',
        enabled: true,
        entries: ['Alex Mercer'],
        tags: ['vip', 'escort'],
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      } as WatchlistRecord,
    ],
  ]);

  const identityProfiles = new Map<string, IdentityProfileRecord>([
    [
      '550e8400-e29b-41d4-a716-446655440781',
      {
        id: '550e8400-e29b-41d4-a716-446655440781',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        type: 'person',
        display_name: 'Alex Mercer',
        reference_key: 'employee-2471',
        enrollment_status: 'active',
        watchlist_ids: ['550e8400-e29b-41d4-a716-446655440772'],
        notes: 'Opt-in executive escort profile.',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      } as IdentityProfileRecord,
    ],
    [
      '550e8400-e29b-41d4-a716-446655440782',
      {
        id: '550e8400-e29b-41d4-a716-446655440782',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        type: 'vehicle',
        display_name: 'Ops Visitor Sedan',
        reference_key: 'OPS-2471',
        enrollment_status: 'opt_in',
        watchlist_ids: ['550e8400-e29b-41d4-a716-446655440771'],
        notes: 'Vehicle record synchronized from access control.',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      } as IdentityProfileRecord,
    ],
  ]);

  const plateReads = new Map<string, PlateReadRecord>();
  const faceMatches = new Map<string, FaceMatchRecord>();
  const reIdTrackLinks = new Map<string, ReIdTrackLinkRecord>();
  const annotationTasks = new Map<string, AnnotationTaskRecord>();
  const datasetVersions = new Map<string, DatasetVersionRecord>();
  const trainingJobs = new Map<string, TrainingJobRecord>();
  const modelRegistryEntries = new Map<string, ModelRegistryEntryRecord>([
    [
      '550e8400-e29b-41d4-a716-446655440791',
      {
        id: '550e8400-e29b-41d4-a716-446655440791',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Ops Detector Baseline',
        family: 'detector-yolo',
        version: '2026.03-r4',
        format: 'onnx',
        source_training_job_id: null,
        stage: 'production',
        metrics: {
          mAP50: 0.79,
          recall: 0.75,
        },
        metadata: {
          source: 'seed',
        },
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      } as unknown as ModelRegistryEntryRecord,
    ],
  ]);
  const modelDeployments = new Map<string, ModelDeploymentRecord>([
    [
      '550e8400-e29b-41d4-a716-446655440792',
      {
        id: '550e8400-e29b-41d4-a716-446655440792',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        model_id: '550e8400-e29b-41d4-a716-446655440791',
        worker_type: 'detector-yolo',
        status: 'production',
        rollout_strategy: 'manual',
        target_scope: 'site',
        target_id: '550e8400-e29b-41d4-a716-446655440001',
        config: {
          sample_ratio: 1,
        },
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      } as unknown as ModelDeploymentRecord,
    ],
  ]);

  policies.set('550e8400-e29b-41d4-a716-446655440602', {
    id: '550e8400-e29b-41d4-a716-446655440602',
    tenant_id: '550e8400-e29b-41d4-a716-446655440002',
    site_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Ops Intrusion Guard',
    conditions: {
      object_classes: ['person'],
      zone_ids: ['550e8400-e29b-41d4-a716-446655440102'],
      min_confidence: 0.5,
      ack_timeout_seconds: 60,
    },
    schedule: {
      mode: '24x7',
    },
    severity_rules: {
      person: 'high',
      default: 'medium',
    },
    enabled: true,
    armed_state: 'armed',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  });

  const alertRoutes = new Map<string, AlertRoute>([
    [
      '550e8400-e29b-41d4-a716-446655440651',
      {
        id: '550e8400-e29b-41d4-a716-446655440651',
        policy_id: '550e8400-e29b-41d4-a716-446655440602',
        channel: 'webhook',
        config: {
          url: 'https://alerts.example.com/hooks/ops',
          stage: 'initial',
          ack_timeout_seconds: 60,
        },
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440652',
      {
        id: '550e8400-e29b-41d4-a716-446655440652',
        policy_id: '550e8400-e29b-41d4-a716-446655440602',
        channel: 'slack',
        config: {
          webhook_url: 'https://hooks.slack.com/services/test/ops',
          stage: 'escalation',
          ack_timeout_seconds: 60,
        },
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const snapshots = new Map<string, Snapshot>([
    [
      '550e8400-e29b-41d4-a716-446655440701',
      {
        id: '550e8400-e29b-41d4-a716-446655440701',
        camera_id: '550e8400-e29b-41d4-a716-446655440000',
        recording_id: null,
        clip_id: null,
        storage_path: '/var/lib/ainvr/snapshots/front-door/latest.jpg',
        mime_type: 'image/jpeg',
        width: 1920,
        height: 1080,
        checksum: null,
        captured_at: '2024-01-01T00:00:00Z',
        source: 'camera',
        metadata: {
          quality: 'high',
        },
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const storageTargets = new Map<string, StorageTarget>([
    [
      '550e8400-e29b-41d4-a716-446655440301',
      {
        id: '550e8400-e29b-41d4-a716-446655440301',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Primary S3 Archive',
        target_type: 's3',
        status: 'healthy',
        config: {
          bucket: 'ainvr-archive',
          region: 'eu-central-1',
          endpoint: 'https://s3.example.com',
        },
        capabilities: {
          supports_replication: true,
          supports_retention: true,
          supports_connection_test: true,
        },
        last_checked_at: '2024-01-01T00:00:00Z',
        last_error: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440302',
      {
        id: '550e8400-e29b-41d4-a716-446655440302',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Tenant Two NFS Hot Archive',
        target_type: 'nfs',
        status: 'healthy',
        config: {
          host: '10.10.0.21',
          share: '/exports/ainvr',
          base_path: tenantTwoNfsRoot,
        },
        capabilities: {
          supports_replication: false,
          supports_retention: true,
          supports_connection_test: true,
          storage_mode: 'mounted-share',
        },
        last_checked_at: '2024-01-01T00:00:00Z',
        last_error: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440303',
      {
        id: '550e8400-e29b-41d4-a716-446655440303',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Tenant Two SMB Review Vault',
        target_type: 'smb',
        status: 'healthy',
        config: {
          host: '10.10.0.22',
          share: '//security/review',
          base_path: tenantTwoSmbRoot,
        },
        capabilities: {
          supports_replication: false,
          supports_retention: true,
          supports_connection_test: true,
          storage_mode: 'mounted-share',
        },
        last_checked_at: '2024-01-01T00:00:00Z',
        last_error: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440304',
      {
        id: '550e8400-e29b-41d4-a716-446655440304',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Tenant Two S3 Replica',
        target_type: 's3',
        status: 'healthy',
        config: {
          bucket: 'tenant-two-archive',
          endpoint: 'https://s3.example.com',
          region: 'eu-central-1',
          base_path: tenantTwoS3Root,
        },
        capabilities: {
          supports_replication: true,
          supports_retention: true,
          supports_connection_test: true,
          storage_mode: 'object',
        },
        last_checked_at: '2024-01-01T00:00:00Z',
        last_error: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const storageTargetCredentials = new Map<string, Record<string, unknown>>([
    [
      '550e8400-e29b-41d4-a716-446655440301',
      {
        access_key_id: 'test-access-key',
        secret_access_key: 'test-secret',
      },
    ],
  ]);

  const storagePolicyAssignments = new Map<string, StoragePolicyAssignment>([
    [
      '550e8400-e29b-41d4-a716-446655440401',
      {
        id: '550e8400-e29b-41d4-a716-446655440401',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        storage_target_id: '550e8400-e29b-41d4-a716-446655440301',
        site_id: '550e8400-e29b-41d4-a716-446655440000',
        camera_id: null,
        path_prefix: 'sites/test-site',
        retention_days: 30,
        replication_enabled: true,
        priority: 100,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440402',
      {
        id: '550e8400-e29b-41d4-a716-446655440402',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        storage_target_id: '550e8400-e29b-41d4-a716-446655440302',
        site_id: null,
        camera_id: '550e8400-e29b-41d4-a716-446655440000',
        path_prefix: 'clips/front-door/nfs',
        retention_days: 30,
        replication_enabled: true,
        priority: 10,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    [
      '550e8400-e29b-41d4-a716-446655440403',
      {
        id: '550e8400-e29b-41d4-a716-446655440403',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        storage_target_id: '550e8400-e29b-41d4-a716-446655440304',
        site_id: null,
        camera_id: '550e8400-e29b-41d4-a716-446655440000',
        path_prefix: 'archive/front-door',
        retention_days: 90,
        replication_enabled: true,
        priority: 20,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const storageObjectCopies = new Map<string, StorageObjectCopy>([
    [
      '550e8400-e29b-41d4-a716-446655440451',
      {
        id: '550e8400-e29b-41d4-a716-446655440451',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        clip_id: '550e8400-e29b-41d4-a716-446655440902',
        recording_id: null,
        storage_target_id: '550e8400-e29b-41d4-a716-446655440301',
        object_path: 's3://ainvr-archive/clips/clip-002.mp4',
        copy_status: 'replicated',
        checksum: 'seeded-checksum',
        size_bytes: 9437184,
        verified_at: '2024-01-01T10:05:20Z',
        created_at: '2024-01-01T10:05:20Z',
        updated_at: '2024-01-01T10:05:20Z',
      },
    ],
  ]);

  const storageReplicationJobs = new Map<string, StorageReplicationJob>([
    [
      '550e8400-e29b-41d4-a716-446655440501',
      {
        id: '550e8400-e29b-41d4-a716-446655440501',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        storage_target_id: '550e8400-e29b-41d4-a716-446655440301',
        object_copy_id: '550e8400-e29b-41d4-a716-446655440451',
        source_path: '/var/ainvr/clips/clip-001.mp4',
        destination_path: 's3://ainvr-archive/clips/clip-001.mp4',
        status: 'succeeded',
        attempts: 1,
        bytes_total: 1048576,
        bytes_transferred: 1048576,
        last_error: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  ]);

  const auditLogs = new Map<string, AuditLog>();

  const nowIso = (): string => new Date().toISOString();

  fastify.decorate('diContainer', {
    cradle: {
      tenantRepository: {
        async findById(id: string): Promise<Tenant | null> {
          return tenants.get(id) ?? null;
        },
        async findBySlug(slug: string): Promise<Tenant | null> {
          return Array.from(tenants.values()).find((tenant) => tenant.slug === slug) ?? null;
        },
      },
      siteRepository: {
        async findById(id: string): Promise<Site | null> {
          return sites.get(id) ?? null;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Site>> {
          const items = Array.from(sites.values()).filter((site) => site.tenant_id === tenantId);
          return paginate(items, pagination);
        },
        async create(data: Partial<Site>): Promise<Site> {
          const now = new Date().toISOString();
          const site: Site = {
            id: randomUUID(),
            tenant_id: data.tenant_id ?? '',
            name: data.name ?? 'New Site',
            address: data.address ?? null,
            timezone: data.timezone ?? 'UTC',
            created_at: now,
            updated_at: now,
          };
          sites.set(site.id, site);
          return site;
        },
        async update(id: string, data: Partial<Site>): Promise<Site | null> {
          const existing = sites.get(id);
          if (!existing) {
            return null;
          }
          const updated: Site = {
            ...existing,
            ...data,
            updated_at: new Date().toISOString(),
          };
          sites.set(id, updated);
          return updated;
        },
        async delete(id: string): Promise<boolean> {
          return sites.delete(id);
        },
      },
      zoneRepository: {
        async findById(id: string): Promise<Zone | null> {
          return zones.get(id) ?? null;
        },
        async findBySiteId(
          siteId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Zone>> {
          const items = Array.from(zones.values()).filter((zone) => zone.site_id === siteId);
          return paginate(items, pagination);
        },
        async create(data: Partial<Zone>): Promise<Zone> {
          const now = nowIso();
          const zone: Zone = {
            id: randomUUID(),
            site_id: data.site_id ?? '',
            name: data.name ?? 'New Zone',
            polygon: data.polygon ?? {},
            zone_type: data.zone_type ?? 'restricted',
            created_at: now,
            updated_at: now,
          };
          zones.set(zone.id, zone);
          return zone;
        },
        async update(id: string, data: Partial<Zone>): Promise<Zone | null> {
          const existing = zones.get(id);
          if (!existing) {
            return null;
          }
          const updated: Zone = {
            ...existing,
            ...data,
            updated_at: nowIso(),
          };
          zones.set(id, updated);
          return updated;
        },
        async delete(id: string): Promise<boolean> {
          return zones.delete(id);
        },
      },
      policyRepository: {
        async findById(id: string): Promise<Policy | null> {
          return policies.get(id) ?? null;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Policy>> {
          const items = Array.from(policies.values()).filter((policy) => policy.tenant_id === tenantId);
          return paginate(items, pagination);
        },
        async findBySiteId(
          siteId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Policy>> {
          const items = Array.from(policies.values()).filter((policy) => policy.site_id === siteId);
          return paginate(items, pagination);
        },
        async create(data: Partial<Policy>): Promise<Policy> {
          const now = nowIso();
          const policy: Policy = {
            id: randomUUID(),
            tenant_id: data.tenant_id ?? '',
            site_id: data.site_id ?? null,
            name: data.name ?? 'New Policy',
            conditions: data.conditions ?? {},
            schedule: data.schedule ?? {},
            severity_rules: data.severity_rules ?? {},
            enabled: data.enabled ?? true,
            armed_state: data.armed_state ?? 'armed',
            created_at: now,
            updated_at: now,
          };
          policies.set(policy.id, policy);
          return policy;
        },
        async update(id: string, data: Partial<Policy>): Promise<Policy | null> {
          const existing = policies.get(id);
          if (!existing) {
            return null;
          }
          const updated: Policy = {
            ...existing,
            ...data,
            site_id: data.site_id !== undefined ? data.site_id : existing.site_id,
            updated_at: nowIso(),
          };
          policies.set(id, updated);
          return updated;
        },
        async delete(id: string): Promise<boolean> {
          return policies.delete(id);
        },
      },
      cameraRepository: {
        async findAll(
          filters: Record<string, unknown> = {},
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Camera>> {
          const items = Array.from(cameras.values()).filter((camera) =>
            Object.entries(filters).every(([key, value]) => camera[key as keyof Camera] === value)
          );
          return paginate(items, pagination);
        },
        async findById(id: string): Promise<Camera | null> {
          return cameras.get(id) ?? null;
        },
        async findBySiteId(
          siteId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Camera>> {
          const items = Array.from(cameras.values()).filter((camera) => camera.site_id === siteId);
          return paginate(items, pagination);
        },
        async create(data: Partial<Camera>): Promise<Camera> {
          const now = new Date().toISOString();
          const camera: Camera = {
            id: randomUUID(),
            site_id: data.site_id ?? '',
            name: data.name ?? 'New Camera',
            stream_url: data.stream_url ?? 'rtsp://localhost/stream',
            protocol: data.protocol ?? 'rtsp',
            status: data.status ?? 'unknown',
            detection_enabled: data.detection_enabled ?? true,
            recording_enabled: data.recording_enabled ?? true,
            created_at: now,
            updated_at: now,
          };
          cameras.set(camera.id, camera);
          return camera;
        },
        async update(id: string, data: Partial<Camera>): Promise<Camera | null> {
          const existing = cameras.get(id);
          if (!existing) {
            return null;
          }
          const updated: Camera = {
            ...existing,
            ...data,
            updated_at: new Date().toISOString(),
          };
          cameras.set(id, updated);
          return updated;
        },
        async delete(id: string): Promise<boolean> {
          return cameras.has(id);
        },
      },
      streamRepository: {
        async findByCameraId(
          cameraId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Stream>> {
          const items = Array.from(streams.values()).filter((stream) => stream.camera_id === cameraId);
          return paginate(items, pagination);
        },
        async create(data: Partial<Stream>): Promise<Stream> {
          const stream: Stream = {
            id: randomUUID(),
            camera_id: data.camera_id ?? '',
            stream_type: data.stream_type ?? 'main',
            url: data.url ?? '',
            active: data.active ?? false,
            created_at: nowIso(),
          };
          streams.set(stream.id, stream);
          return stream;
        },
      },
      enrichmentRepository: {
        async findById(id: string): Promise<EnrichmentRecord | null> {
          return enrichments.get(id) ?? null;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            status?: EnrichmentRecord['status'];
            incident_id?: string;
            event_id?: string;
            source_type?: EnrichmentRecord['source_type'];
          } = {}
        ): Promise<PaginatedResult<EnrichmentRecord>> {
          const items = Array.from(enrichments.values())
            .filter((enrichment) => enrichment.tenant_id === tenantId)
            .filter((enrichment) => !filters.status || enrichment.status === filters.status)
            .filter((enrichment) => !filters.incident_id || enrichment.incident_id === filters.incident_id)
            .filter((enrichment) => !filters.event_id || enrichment.event_id === filters.event_id)
            .filter((enrichment) => !filters.source_type || enrichment.source_type === filters.source_type)
            .sort((a, b) => b.queued_at.localeCompare(a.queued_at));
          return paginate(items, pagination);
        },
        async findBySource(
          tenantId: string,
          sourceType: EnrichmentRecord['source_type'],
          sourceId: string
        ): Promise<EnrichmentRecord | null> {
          return (
            Array.from(enrichments.values()).find(
              (enrichment) =>
                enrichment.tenant_id === tenantId &&
                enrichment.source_type === sourceType &&
                enrichment.source_id === sourceId
            ) ?? null
          );
        },
        async findByIncidentId(incidentId: string): Promise<EnrichmentRecord[]> {
          return Array.from(enrichments.values())
            .filter((enrichment) => enrichment.incident_id === incidentId)
            .sort((a, b) => b.queued_at.localeCompare(a.queued_at));
        },
        async create(data: Partial<EnrichmentRecord>): Promise<EnrichmentRecord> {
          const now = nowIso();
          const enrichment: EnrichmentRecord = {
            id: data.id ?? randomUUID(),
            tenant_id: data.tenant_id ?? '',
            source_type: data.source_type ?? 'incident',
            source_id: data.source_id ?? '',
            incident_id: data.incident_id ?? null,
            event_id: data.event_id ?? null,
            clip_id: data.clip_id ?? null,
            snapshot_id: data.snapshot_id ?? null,
            recording_id: data.recording_id ?? null,
            status: data.status ?? 'queued',
            model: data.model ?? 'vlm-fallback-v1',
            summary: data.summary ?? null,
            suspicious_context: data.suspicious_context ?? [],
            keywords: data.keywords ?? [],
            semantic_terms: data.semantic_terms ?? [],
            queued_at: data.queued_at ?? now,
            started_at: data.started_at ?? null,
            completed_at: data.completed_at ?? null,
            error_message: data.error_message ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          enrichments.set(enrichment.id, enrichment);
          return enrichment;
        },
        async update(id: string, data: Partial<EnrichmentRecord>): Promise<EnrichmentRecord | null> {
          const existing = enrichments.get(id);
          if (!existing) {
            return null;
          }
          const updated: EnrichmentRecord = {
            ...existing,
            ...data,
            updated_at: data.updated_at ?? nowIso(),
          };
          enrichments.set(id, updated);
          return updated;
        },
      },
      eventRepository: {
        async findById(id: string): Promise<EventRecord | null> {
          return events.get(id) ?? null;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            camera_id?: string;
            event_type?: string;
            severity?: EventRecord['severity'];
            date_from?: string;
            date_to?: string;
          } = {}
        ): Promise<PaginatedResult<EventRecord>> {
          const items = Array.from(events.values())
            .filter((event) => event.tenant_id === tenantId)
            .filter((event) => !filters.camera_id || event.camera_id === filters.camera_id)
            .filter((event) => !filters.event_type || event.event_type === filters.event_type)
            .filter((event) => !filters.severity || event.severity === filters.severity)
            .filter((event) => !filters.date_from || event.timestamp >= filters.date_from)
            .filter((event) => !filters.date_to || event.timestamp <= filters.date_to)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          return paginate(items, pagination);
        },
        async create(data: Partial<EventRecord>): Promise<EventRecord> {
          const event: EventRecord = {
            id: data.id ?? randomUUID(),
            camera_id: data.camera_id ?? '',
            site_id: data.site_id ?? '',
            tenant_id: data.tenant_id ?? '',
            event_type: data.event_type ?? 'detection.created',
            timestamp: data.timestamp ?? nowIso(),
            payload: data.payload ?? {},
            severity: data.severity ?? 'medium',
            correlation_id: data.correlation_id ?? randomUUID(),
            created_at: data.created_at ?? nowIso(),
          };
          events.set(event.id, event);
          return event;
        },
      },
      recordingRepository: {
        async findById(id: string): Promise<Recording | null> {
          return recordings.get(id) ?? null;
        },
        async findByCameraId(
          cameraId: string,
          pagination: PaginationOptions = {},
          range?: { start_from?: string; start_to?: string }
        ): Promise<PaginatedResult<Recording>> {
          const items = Array.from(recordings.values())
            .filter((recording) => recording.camera_id === cameraId)
            .filter((recording) => !range?.start_from || recording.start_time >= range.start_from)
            .filter((recording) => !range?.start_to || recording.start_time <= range.start_to)
            .sort((a, b) => b.start_time.localeCompare(a.start_time));
          return paginate(items, pagination);
        },
        async create(data: Partial<Recording>): Promise<Recording> {
          const recording: Recording = {
            id: data.id ?? randomUUID(),
            camera_id: data.camera_id ?? '',
            start_time: data.start_time ?? nowIso(),
            end_time: data.end_time ?? null,
            file_path: data.file_path ?? null,
            file_size: data.file_size ?? null,
            recording_mode: data.recording_mode ?? 'continuous',
            created_at: data.created_at ?? nowIso(),
          };
          recordings.set(recording.id, recording);
          return recording;
        },
        async update(id: string, data: Partial<Recording>): Promise<Recording | null> {
          const existing = recordings.get(id);
          if (!existing) {
            return null;
          }
          const updated: Recording = {
            ...existing,
            ...data,
          };
          recordings.set(id, updated);
          return updated;
        },
      },
      clipRepository: {
        async findById(id: string): Promise<Clip | null> {
          return clips.get(id) ?? null;
        },
        async findByCameraId(
          cameraId: string,
          pagination: PaginationOptions = {},
          range?: { start_from?: string; start_to?: string }
        ): Promise<PaginatedResult<Clip>> {
          const items = Array.from(clips.values())
            .filter((clip) => clip.camera_id === cameraId)
            .filter((clip) => !range?.start_from || clip.start_time >= range.start_from)
            .filter((clip) => !range?.start_to || clip.start_time <= range.start_to)
            .sort((a, b) => b.start_time.localeCompare(a.start_time));
          return paginate(items, pagination);
        },
        async create(data: Partial<Clip>): Promise<Clip> {
          const clip: Clip = {
            id: data.id ?? randomUUID(),
            camera_id: data.camera_id ?? '',
            recording_id: data.recording_id ?? null,
            start_time: data.start_time ?? nowIso(),
            end_time: data.end_time ?? nowIso(),
            file_path: data.file_path ?? '',
            file_size: data.file_size ?? null,
            thumbnail_path: data.thumbnail_path ?? null,
            metadata: data.metadata ?? {},
            created_at: data.created_at ?? nowIso(),
          };
          clips.set(clip.id, clip);
          return clip;
        },
      },
      snapshotRepository: {
        async findById(id: string): Promise<Snapshot | null> {
          return snapshots.get(id) ?? null;
        },
        async findByCameraId(
          cameraId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Snapshot>> {
          const items = Array.from(snapshots.values()).filter((snapshot) => snapshot.camera_id === cameraId);
          return paginate(items.sort((a, b) => b.captured_at.localeCompare(a.captured_at)), pagination);
        },
        async findLatestByCameraId(cameraId: string): Promise<Snapshot | null> {
          const items = Array.from(snapshots.values())
            .filter((snapshot) => snapshot.camera_id === cameraId)
            .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
          return items[0] ?? null;
        },
        async create(data: Partial<Snapshot>): Promise<Snapshot> {
          const now = nowIso();
          const snapshot: Snapshot = {
            id: data.id ?? randomUUID(),
            camera_id: data.camera_id ?? '',
            recording_id: data.recording_id ?? null,
            clip_id: data.clip_id ?? null,
            storage_path: data.storage_path ?? '',
            mime_type: data.mime_type ?? 'image/jpeg',
            width: data.width ?? null,
            height: data.height ?? null,
            checksum: data.checksum ?? null,
            captured_at: data.captured_at ?? now,
            source: data.source ?? 'camera',
            metadata: data.metadata ?? {},
            created_at: data.created_at ?? now,
          };
          snapshots.set(snapshot.id, snapshot);
          return snapshot;
        },
      },
      incidentRepository: {
        async findAll(
          filters: Record<string, unknown> = {},
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Incident>> {
          const items = Array.from(incidents.values()).filter((incident) =>
            Object.entries(filters).every(([key, value]) => incident[key as keyof Incident] === value)
          );
          return paginate(items, pagination);
        },
        async findById(id: string): Promise<Incident | null> {
          return incidents.get(id) ?? null;
        },
        async findByStatus(
          tenantId: string,
          status: Incident['status'],
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<Incident>> {
          const items = Array.from(incidents.values()).filter(
            (incident) => incident.tenant_id === tenantId && incident.status === status
          );
          return paginate(items, pagination);
        },
        async create(data: Partial<Incident>): Promise<Incident> {
          const now = nowIso();
          const incident: Incident = {
            id: data.id ?? randomUUID(),
            tenant_id: data.tenant_id ?? '',
            site_id: data.site_id ?? '',
            severity: data.severity ?? 'medium',
            confidence: data.confidence ?? 0.5,
            category: data.category ?? 'detection',
            summary: data.summary ?? 'Detection event',
            status: data.status ?? 'open',
            camera_ids: data.camera_ids ?? [],
            timeline_start: data.timeline_start ?? now,
            timeline_end: data.timeline_end ?? now,
            policy_hits: data.policy_hits ?? {},
            escalation_state: data.escalation_state ?? 'none',
            linked_event_ids: data.linked_event_ids ?? [],
            evidence_references: data.evidence_references ?? [],
            dedupe_count: data.dedupe_count ?? 1,
            acknowledged_by: data.acknowledged_by ?? null,
            acknowledged_at: data.acknowledged_at ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          incidents.set(incident.id, incident);
          return incident;
        },
        async acknowledge(id: string, userId: string): Promise<Incident | null> {
          const existing = incidents.get(id);
          if (!existing) {
            return null;
          }
          const updated: Incident = {
            ...existing,
            status: 'acknowledged',
            acknowledged_by: userId,
            acknowledged_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          incidents.set(id, updated);
          return updated;
        },
        async escalate(id: string): Promise<Incident | null> {
          const existing = incidents.get(id);
          if (!existing) {
            return null;
          }
          const updated: Incident = {
            ...existing,
            escalation_state: 'escalated',
            updated_at: new Date().toISOString(),
          };
          incidents.set(id, updated);
          return updated;
        },
        async close(id: string): Promise<Incident | null> {
          const existing = incidents.get(id);
          if (!existing) {
            return null;
          }
          const updated: Incident = {
            ...existing,
            status: 'closed',
            updated_at: new Date().toISOString(),
          };
          incidents.set(id, updated);
          return updated;
        },
        async update(id: string, data: Partial<Incident>): Promise<Incident | null> {
          const existing = incidents.get(id);
          if (!existing) {
            return null;
          }
          const updated: Incident = {
            ...existing,
            ...data,
            updated_at: nowIso(),
          };
          incidents.set(id, updated);
          return updated;
        },
      },
      auditLogRepository: {
        async log(
          tenantId: string,
          userId: string,
          action: string,
          resourceType: string,
          resourceId?: string,
          details?: Record<string, unknown>,
          ipAddress?: string
        ): Promise<AuditLog> {
          const auditLog: AuditLog = {
            id: randomUUID(),
            tenant_id: tenantId,
            user_id: userId,
            action,
            resource_type: resourceType,
            resource_id: resourceId ?? null,
            details: details ?? {},
            ip_address: ipAddress ?? null,
            created_at: new Date().toISOString(),
          };
          auditLogs.set(auditLog.id, auditLog);
          return auditLog;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<AuditLog>> {
          const items = Array.from(auditLogs.values()).filter((log) => log.tenant_id === tenantId);
          return paginate(items, pagination);
        },
      },
      alertRouteRepository: {
        async findById(id: string): Promise<AlertRoute | null> {
          return alertRoutes.get(id) ?? null;
        },
        async findByPolicyId(policyId: string): Promise<AlertRoute[]> {
          return Array.from(alertRoutes.values())
            .filter((route) => route.policy_id === policyId)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
        },
        async create(data: Partial<AlertRoute>): Promise<AlertRoute> {
          const route: AlertRoute = {
            id: randomUUID(),
            policy_id: data.policy_id ?? '',
            channel: (data.channel ?? 'webhook') as AlertRoute['channel'],
            config: data.config ?? {},
            enabled: data.enabled ?? true,
            created_at: data.created_at ?? nowIso(),
          };
          alertRoutes.set(route.id, route);
          return route;
        },
        async update(id: string, data: Partial<AlertRoute>): Promise<AlertRoute | null> {
          const existing = alertRoutes.get(id);
          if (!existing) {
            return null;
          }
          const updated: AlertRoute = {
            ...existing,
            ...data,
          };
          alertRoutes.set(id, updated);
          return updated;
        },
        async delete(id: string): Promise<boolean> {
          return alertRoutes.delete(id);
        },
      },
      searchDocumentRepository: {
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            site_id?: string;
            camera_id?: string;
            severity?: string;
            source_type?: SearchDocument['source_type'];
          } = {}
        ): Promise<PaginatedResult<SearchDocument>> {
          const items = Array.from(searchDocuments.values())
            .filter((document) => document.tenant_id === tenantId)
            .filter((document) => !filters.site_id || document.site_id === filters.site_id)
            .filter(
              (document) => !filters.camera_id || document.camera_ids.includes(filters.camera_id)
            )
            .filter((document) => !filters.severity || document.severity === filters.severity)
            .filter((document) => !filters.source_type || document.source_type === filters.source_type)
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
          return paginate(items, pagination);
        },
        async findBySource(
          tenantId: string,
          sourceType: SearchDocument['source_type'],
          sourceId: string
        ): Promise<SearchDocument | null> {
          return (
            Array.from(searchDocuments.values()).find(
              (document) =>
                document.tenant_id === tenantId &&
                document.source_type === sourceType &&
                document.source_id === sourceId
            ) ?? null
          );
        },
        async create(data: Partial<SearchDocument>): Promise<SearchDocument> {
          const now = nowIso();
          const document: SearchDocument = {
            id: data.id ?? randomUUID(),
            tenant_id: data.tenant_id ?? '',
            site_id: data.site_id ?? '',
            source_type: data.source_type ?? 'incident',
            source_id: data.source_id ?? '',
            incident_id: data.incident_id ?? null,
            event_id: data.event_id ?? null,
            clip_id: data.clip_id ?? null,
            camera_ids: data.camera_ids ?? [],
            severity: data.severity ?? null,
            title: data.title ?? 'Search result',
            summary: data.summary ?? '',
            occurred_at: data.occurred_at ?? now,
            keywords: data.keywords ?? [],
            semantic_terms: data.semantic_terms ?? [],
            matched_terms: data.matched_terms ?? [],
            score: data.score ?? 0,
            vlm_summary: data.vlm_summary ?? null,
            suspicious_context: data.suspicious_context ?? [],
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          searchDocuments.set(document.id, document);
          return document;
        },
        async update(id: string, data: Partial<SearchDocument>): Promise<SearchDocument | null> {
          const existing = searchDocuments.get(id);
          if (!existing) {
            return null;
          }
          const updated: SearchDocument = {
            ...existing,
            ...data,
            updated_at: data.updated_at ?? nowIso(),
          };
          searchDocuments.set(id, updated);
          return updated;
        },
      },
      specializedIntelligenceRepository: {
        async listWatchlists(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            kind?: WatchlistRecord['kind'];
            enabled?: boolean;
            disposition?: WatchlistRecord['disposition'];
          } = {}
        ): Promise<PaginatedResult<WatchlistRecord>> {
          const items = Array.from(watchlists.values())
            .filter((watchlist) => watchlist.tenant_id === tenantId)
            .filter((watchlist) => !filters.kind || watchlist.kind === filters.kind)
            .filter((watchlist) => filters.enabled === undefined || watchlist.enabled === filters.enabled)
            .filter(
              (watchlist) => !filters.disposition || watchlist.disposition === filters.disposition
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          return paginate(items, pagination);
        },
        async listIdentityProfiles(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            type?: IdentityProfileRecord['type'];
            enrollment_status?: IdentityProfileRecord['enrollment_status'];
          } = {}
        ): Promise<PaginatedResult<IdentityProfileRecord>> {
          const items = Array.from(identityProfiles.values())
            .filter((profile) => profile.tenant_id === tenantId)
            .filter((profile) => !filters.type || profile.type === filters.type)
            .filter(
              (profile) =>
                !filters.enrollment_status || profile.enrollment_status === filters.enrollment_status
            )
            .sort((a, b) => a.display_name.localeCompare(b.display_name));
          return paginate(items, pagination);
        },
        async listPlateReads(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            incident_id?: string;
            camera_id?: string;
            watchlist_id?: string;
          } = {}
        ): Promise<PaginatedResult<PlateReadRecord>> {
          const items = Array.from(plateReads.values())
            .filter((plateRead) => plateRead.tenant_id === tenantId)
            .filter((plateRead) => !filters.incident_id || plateRead.incident_id === filters.incident_id)
            .filter((plateRead) => !filters.camera_id || plateRead.camera_id === filters.camera_id)
            .filter((plateRead) => !filters.watchlist_id || plateRead.watchlist_id === filters.watchlist_id)
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
          return paginate(items, pagination);
        },
        async listFaceMatches(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            incident_id?: string;
            camera_id?: string;
            watchlist_id?: string;
            identity_profile_id?: string;
          } = {}
        ): Promise<PaginatedResult<FaceMatchRecord>> {
          const items = Array.from(faceMatches.values())
            .filter((faceMatch) => faceMatch.tenant_id === tenantId)
            .filter((faceMatch) => !filters.incident_id || faceMatch.incident_id === filters.incident_id)
            .filter((faceMatch) => !filters.camera_id || faceMatch.camera_id === filters.camera_id)
            .filter((faceMatch) => !filters.watchlist_id || faceMatch.watchlist_id === filters.watchlist_id)
            .filter(
              (faceMatch) =>
                !filters.identity_profile_id ||
                faceMatch.identity_profile_id === filters.identity_profile_id
            )
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
          return paginate(items, pagination);
        },
        async listReIdLinks(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            incident_id?: string;
            camera_id?: string;
            status?: ReIdTrackLinkRecord['status'];
          } = {}
        ): Promise<PaginatedResult<ReIdTrackLinkRecord>> {
          const items = Array.from(reIdTrackLinks.values())
            .filter((reIdLink) => reIdLink.tenant_id === tenantId)
            .filter((reIdLink) => !filters.incident_id || reIdLink.incident_id === filters.incident_id)
            .filter(
              (reIdLink) =>
                !filters.camera_id ||
                reIdLink.origin_camera_id === filters.camera_id ||
                reIdLink.target_camera_id === filters.camera_id
            )
            .filter((reIdLink) => !filters.status || reIdLink.status === filters.status)
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
          return paginate(items, pagination);
        },
        async createWatchlist(data: Partial<WatchlistRecord>): Promise<WatchlistRecord> {
          const now = nowIso();
          const watchlist: WatchlistRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            kind: data.kind ?? 'plate',
            name: data.name ?? 'New Watchlist',
            description: data.description ?? null,
            disposition: data.disposition ?? 'interest',
            severity: data.severity ?? 'medium',
            enabled: data.enabled ?? true,
            entries: data.entries ?? [],
            tags: data.tags ?? [],
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          watchlists.set(watchlist.id, watchlist);
          return watchlist;
        },
        async createIdentityProfile(
          data: Partial<IdentityProfileRecord>
        ): Promise<IdentityProfileRecord> {
          const now = nowIso();
          const profile: IdentityProfileRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            type: data.type ?? 'person',
            display_name: data.display_name ?? 'New Profile',
            reference_key: data.reference_key ?? `profile-${randomUUID().slice(0, 8)}`,
            enrollment_status: data.enrollment_status ?? 'pending_review',
            watchlist_ids: data.watchlist_ids ?? [],
            notes: data.notes ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          identityProfiles.set(profile.id, profile);
          return profile;
        },
        async createPlateRead(data: Partial<PlateReadRecord>): Promise<PlateReadRecord> {
          const now = nowIso();
          const plateRead: PlateReadRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            site_id: data.site_id ?? asId(''),
            camera_id: data.camera_id ?? asId(''),
            event_id: data.event_id ?? null,
            incident_id: data.incident_id ?? null,
            watchlist_id: data.watchlist_id ?? null,
            plate_text: data.plate_text ?? 'UNKNOWN',
            plate_region: data.plate_region ?? null,
            confidence: data.confidence ?? 0.5,
            direction: data.direction ?? 'unknown',
            vehicle_type: data.vehicle_type ?? null,
            occurred_at: data.occurred_at ?? now,
            created_at: data.created_at ?? now,
            metadata: data.metadata ?? {},
          };
          plateReads.set(plateRead.id, plateRead);
          return plateRead;
        },
        async createFaceMatch(data: Partial<FaceMatchRecord>): Promise<FaceMatchRecord> {
          const now = nowIso();
          const faceMatch: FaceMatchRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            site_id: data.site_id ?? asId(''),
            camera_id: data.camera_id ?? asId(''),
            event_id: data.event_id ?? null,
            incident_id: data.incident_id ?? null,
            identity_profile_id: data.identity_profile_id ?? null,
            watchlist_id: data.watchlist_id ?? null,
            subject_label: data.subject_label ?? 'Unknown Subject',
            confidence: data.confidence ?? 0.5,
            status: data.status ?? 'opt_in_required',
            occurred_at: data.occurred_at ?? now,
            created_at: data.created_at ?? now,
            metadata: data.metadata ?? {},
          };
          faceMatches.set(faceMatch.id, faceMatch);
          return faceMatch;
        },
        async createReIdLink(data: Partial<ReIdTrackLinkRecord>): Promise<ReIdTrackLinkRecord> {
          const now = nowIso();
          const reIdLink: ReIdTrackLinkRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            incident_id: data.incident_id ?? null,
            origin_camera_id: data.origin_camera_id ?? asId(''),
            target_camera_id: data.target_camera_id ?? asId(''),
            origin_event_id: data.origin_event_id ?? null,
            target_event_id: data.target_event_id ?? null,
            source_track_id: data.source_track_id ?? `track-${randomUUID().slice(0, 8)}`,
            target_track_id: data.target_track_id ?? `track-${randomUUID().slice(0, 8)}`,
            confidence: data.confidence ?? 0.5,
            status: data.status ?? 'candidate',
            movement_hint: data.movement_hint ?? 'Movement path pending',
            travel_time_seconds: data.travel_time_seconds ?? 0,
            occurred_at: data.occurred_at ?? now,
            created_at: data.created_at ?? now,
            metadata: data.metadata ?? {},
          };
          reIdTrackLinks.set(reIdLink.id, reIdLink);
          return reIdLink;
        },
      },
      modelLifecycleRepository: {
        async listAnnotationTasks(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            incident_id?: string;
            camera_id?: string;
            status?: AnnotationTaskRecord['status'];
          } = {}
        ): Promise<PaginatedResult<AnnotationTaskRecord>> {
          const items = Array.from(annotationTasks.values())
            .filter((annotation) => annotation.tenant_id === tenantId)
            .filter((annotation) => !filters.incident_id || annotation.incident_id === filters.incident_id)
            .filter((annotation) => !filters.camera_id || annotation.camera_id === filters.camera_id)
            .filter((annotation) => !filters.status || annotation.status === filters.status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return paginate(items, pagination);
        },
        async listDatasetVersions(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            status?: DatasetVersionRecord['status'];
          } = {}
        ): Promise<PaginatedResult<DatasetVersionRecord>> {
          const items = Array.from(datasetVersions.values())
            .filter((dataset) => dataset.tenant_id === tenantId)
            .filter((dataset) => !filters.status || dataset.status === filters.status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return paginate(items, pagination);
        },
        async listTrainingJobs(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            status?: TrainingJobRecord['status'];
          } = {}
        ): Promise<PaginatedResult<TrainingJobRecord>> {
          const items = Array.from(trainingJobs.values())
            .filter((job) => job.tenant_id === tenantId)
            .filter((job) => !filters.status || job.status === filters.status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return paginate(items, pagination);
        },
        async listModels(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            family?: string;
            stage?: ModelRegistryEntryRecord['stage'];
          } = {}
        ): Promise<PaginatedResult<ModelRegistryEntryRecord>> {
          const items = Array.from(modelRegistryEntries.values())
            .filter((model) => model.tenant_id === tenantId)
            .filter((model) => !filters.family || model.family === filters.family)
            .filter((model) => !filters.stage || model.stage === filters.stage)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return paginate(items, pagination);
        },
        async listDeployments(
          tenantId: string,
          pagination: PaginationOptions = {},
          filters: {
            status?: ModelDeploymentRecord['status'];
            target_scope?: ModelDeploymentRecord['target_scope'];
          } = {}
        ): Promise<PaginatedResult<ModelDeploymentRecord>> {
          const items = Array.from(modelDeployments.values())
            .filter((deployment) => deployment.tenant_id === tenantId)
            .filter((deployment) => !filters.status || deployment.status === filters.status)
            .filter((deployment) => !filters.target_scope || deployment.target_scope === filters.target_scope)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return paginate(items, pagination);
        },
        async createAnnotationTask(data: Partial<AnnotationTaskRecord>): Promise<AnnotationTaskRecord> {
          const now = nowIso();
          const annotation: AnnotationTaskRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            site_id: data.site_id ?? asId(''),
            camera_id: data.camera_id ?? asId(''),
            incident_id: data.incident_id ?? null,
            clip_id: data.clip_id ?? null,
            snapshot_id: data.snapshot_id ?? null,
            recording_id: data.recording_id ?? null,
            source_type: data.source_type ?? 'incident',
            label_schema: data.label_schema ?? [],
            status: data.status ?? 'queued',
            priority: data.priority ?? 'medium',
            assigned_to: data.assigned_to ?? null,
            notes: data.notes ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          annotationTasks.set(annotation.id, annotation);
          return annotation;
        },
        async createDatasetVersion(data: Partial<DatasetVersionRecord>): Promise<DatasetVersionRecord> {
          const now = nowIso();
          const dataset: DatasetVersionRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            name: data.name ?? 'New Dataset',
            version: data.version ?? 'draft',
            annotation_task_ids: data.annotation_task_ids ?? [],
            label_count: data.label_count ?? 0,
            class_distribution: data.class_distribution ?? {},
            status: data.status ?? 'draft',
            storage_uri: data.storage_uri ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          datasetVersions.set(dataset.id, dataset);
          return dataset;
        },
        async createTrainingJob(data: Partial<TrainingJobRecord>): Promise<TrainingJobRecord> {
          const now = nowIso();
          const trainingJob: TrainingJobRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            dataset_version_id: data.dataset_version_id ?? asId(randomUUID()),
            model_family: data.model_family ?? 'detector-yolo',
            status: data.status ?? 'queued',
            metrics: data.metrics ?? {},
            output_model_id: data.output_model_id ?? null,
            started_at: data.started_at ?? null,
            completed_at: data.completed_at ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          trainingJobs.set(trainingJob.id, trainingJob);
          return trainingJob;
        },
        async createModel(data: Partial<ModelRegistryEntryRecord>): Promise<ModelRegistryEntryRecord> {
          const now = nowIso();
          const model: ModelRegistryEntryRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            name: data.name ?? 'New Model',
            family: data.family ?? 'detector-yolo',
            version: data.version ?? 'draft',
            format: data.format ?? 'onnx',
            source_training_job_id: data.source_training_job_id ?? null,
            stage: data.stage ?? 'candidate',
            metrics: data.metrics ?? {},
            metadata: data.metadata ?? {},
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          modelRegistryEntries.set(model.id, model);
          return model;
        },
        async createDeployment(data: Partial<ModelDeploymentRecord>): Promise<ModelDeploymentRecord> {
          const now = nowIso();
          const deployment: ModelDeploymentRecord = {
            id: data.id ?? asId(randomUUID()),
            tenant_id: data.tenant_id ?? asId(''),
            model_id: data.model_id ?? asId(randomUUID()),
            worker_type: data.worker_type ?? 'detector-yolo',
            status: data.status ?? 'staged',
            rollout_strategy: data.rollout_strategy ?? 'manual',
            target_scope: data.target_scope ?? 'global',
            target_id: data.target_id ?? null,
            config: data.config ?? {},
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          modelDeployments.set(deployment.id, deployment);
          return deployment;
        },
        async updateTrainingJob(
          id: string,
          data: Partial<TrainingJobRecord>
        ): Promise<TrainingJobRecord | null> {
          const existing = trainingJobs.get(id);
          if (!existing) {
            return null;
          }
          const updated: TrainingJobRecord = {
            ...existing,
            ...data,
            updated_at: data.updated_at ?? nowIso(),
          };
          trainingJobs.set(id, updated);
          return updated;
        },
        async updateModel(
          id: string,
          data: Partial<ModelRegistryEntryRecord>
        ): Promise<ModelRegistryEntryRecord | null> {
          const existing = modelRegistryEntries.get(id);
          if (!existing) {
            return null;
          }
          const updated: ModelRegistryEntryRecord = {
            ...existing,
            ...data,
            updated_at: data.updated_at ?? nowIso(),
          };
          modelRegistryEntries.set(id, updated);
          return updated;
        },
        async updateDeployment(
          id: string,
          data: Partial<ModelDeploymentRecord>
        ): Promise<ModelDeploymentRecord | null> {
          const existing = modelDeployments.get(id);
          if (!existing) {
            return null;
          }
          const updated: ModelDeploymentRecord = {
            ...existing,
            ...data,
            updated_at: data.updated_at ?? nowIso(),
          };
          modelDeployments.set(id, updated);
          return updated;
        },
      },
      storageTargetRepository: {
        async findById(id: string): Promise<StorageTarget | null> {
          return storageTargets.get(id) ?? null;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<StorageTarget>> {
          const items = Array.from(storageTargets.values()).filter((target) => target.tenant_id === tenantId);
          return paginate(items, pagination);
        },
        async create(data: Partial<StorageTarget>): Promise<StorageTarget> {
          const now = nowIso();
          const target: StorageTarget = {
            id: randomUUID(),
            tenant_id: data.tenant_id ?? '',
            name: data.name ?? 'New Storage Target',
            target_type: data.target_type ?? 'local',
            status: data.status ?? 'unknown',
            config: data.config ?? {},
            capabilities: data.capabilities ?? {},
            last_checked_at: data.last_checked_at ?? null,
            last_error: data.last_error ?? null,
            created_at: now,
            updated_at: now,
          };
          storageTargets.set(target.id, target);
          return target;
        },
        async update(id: string, data: Partial<StorageTarget>): Promise<StorageTarget | null> {
          const existing = storageTargets.get(id);
          if (!existing) {
            return null;
          }
          const updated: StorageTarget = {
            ...existing,
            ...data,
            updated_at: nowIso(),
          };
          storageTargets.set(id, updated);
          return updated;
        },
        async delete(id: string): Promise<boolean> {
          storageTargetCredentials.delete(id);
          return storageTargets.delete(id);
        },
        async updateStatus(
          id: string,
          status: StorageTarget['status'],
          errorMessage: string | null = null
        ): Promise<StorageTarget | null> {
          const existing = storageTargets.get(id);
          if (!existing) {
            return null;
          }
          const updated: StorageTarget = {
            ...existing,
            status,
            last_error: errorMessage,
            last_checked_at: nowIso(),
            updated_at: nowIso(),
          };
          storageTargets.set(id, updated);
          return updated;
        },
        async rotateCredentials(
          storageTargetId: string,
          credentials: Record<string, unknown>
        ): Promise<void> {
          storageTargetCredentials.set(storageTargetId, credentials);
        },
      },
      storagePolicyAssignmentRepository: {
        async findByTargetId(
          storageTargetId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<StoragePolicyAssignment>> {
          const items = Array.from(storagePolicyAssignments.values()).filter(
            (assignment) => assignment.storage_target_id === storageTargetId
          );
          return paginate(items, pagination);
        },
        async findBySiteId(siteId: string): Promise<StoragePolicyAssignment[]> {
          return Array.from(storagePolicyAssignments.values()).filter(
            (assignment) => assignment.site_id === siteId
          );
        },
        async findByCameraId(cameraId: string): Promise<StoragePolicyAssignment[]> {
          return Array.from(storagePolicyAssignments.values()).filter(
            (assignment) => assignment.camera_id === cameraId
          );
        },
        async assignToSite(
          input: Omit<StoragePolicyAssignment, 'id' | 'created_at' | 'updated_at'>
        ): Promise<StoragePolicyAssignment> {
          const existing = Array.from(storagePolicyAssignments.values()).find(
            (assignment) =>
              assignment.storage_target_id === input.storage_target_id &&
              assignment.site_id === input.site_id &&
              assignment.camera_id === null
          );
          const now = nowIso();
          const assignment: StoragePolicyAssignment = {
            id: existing?.id ?? randomUUID(),
            tenant_id: input.tenant_id,
            storage_target_id: input.storage_target_id,
            site_id: input.site_id ?? null,
            camera_id: null,
            path_prefix: input.path_prefix ?? null,
            retention_days: input.retention_days,
            replication_enabled: input.replication_enabled,
            priority: input.priority,
            created_at: existing?.created_at ?? now,
            updated_at: now,
          };
          storagePolicyAssignments.set(assignment.id, assignment);
          return assignment;
        },
        async assignToCamera(
          input: Omit<StoragePolicyAssignment, 'id' | 'created_at' | 'updated_at'>
        ): Promise<StoragePolicyAssignment> {
          const existing = Array.from(storagePolicyAssignments.values()).find(
            (assignment) =>
              assignment.storage_target_id === input.storage_target_id &&
              assignment.camera_id === input.camera_id &&
              assignment.site_id === null
          );
          const now = nowIso();
          const assignment: StoragePolicyAssignment = {
            id: existing?.id ?? randomUUID(),
            tenant_id: input.tenant_id,
            storage_target_id: input.storage_target_id,
            site_id: null,
            camera_id: input.camera_id ?? null,
            path_prefix: input.path_prefix ?? null,
            retention_days: input.retention_days,
            replication_enabled: input.replication_enabled,
            priority: input.priority,
            created_at: existing?.created_at ?? now,
            updated_at: now,
          };
          storagePolicyAssignments.set(assignment.id, assignment);
          return assignment;
        },
      },
      storageObjectCopyRepository: {
        async findById(id: string): Promise<StorageObjectCopy | null> {
          return storageObjectCopies.get(id) ?? null;
        },
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<StorageObjectCopy>> {
          const items = Array.from(storageObjectCopies.values())
            .filter((copy) => copy.tenant_id === tenantId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          return paginate(items, pagination);
        },
        async findByTargetId(storageTargetId: string): Promise<StorageObjectCopy[]> {
          return Array.from(storageObjectCopies.values())
            .filter((copy) => copy.storage_target_id === storageTargetId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        },
        async findByClipId(clipId: string): Promise<StorageObjectCopy[]> {
          return Array.from(storageObjectCopies.values())
            .filter((copy) => copy.clip_id === clipId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        },
        async create(data: Partial<StorageObjectCopy>): Promise<StorageObjectCopy> {
          const now = nowIso();
          const copy: StorageObjectCopy = {
            id: data.id ?? randomUUID(),
            tenant_id: data.tenant_id ?? '',
            clip_id: data.clip_id ?? null,
            recording_id: data.recording_id ?? null,
            storage_target_id: data.storage_target_id ?? '',
            object_path: data.object_path ?? '',
            copy_status: data.copy_status ?? 'local_only',
            checksum: data.checksum ?? null,
            size_bytes: data.size_bytes ?? null,
            verified_at: data.verified_at ?? null,
            created_at: data.created_at ?? now,
            updated_at: data.updated_at ?? now,
          };
          storageObjectCopies.set(copy.id, copy);
          return copy;
        },
        async updateStatus(
          id: string,
          status: StorageObjectCopy['copy_status'],
          params: { checksum?: string | null; size_bytes?: number | null; verified_at?: string | null } = {}
        ): Promise<StorageObjectCopy | null> {
          const existing = storageObjectCopies.get(id);
          if (!existing) {
            return null;
          }
          const updated: StorageObjectCopy = {
            ...existing,
            copy_status: status,
            checksum: params.checksum !== undefined ? params.checksum : existing.checksum,
            size_bytes: params.size_bytes !== undefined ? params.size_bytes : existing.size_bytes,
            verified_at: params.verified_at !== undefined ? params.verified_at : existing.verified_at,
            updated_at: nowIso(),
          };
          storageObjectCopies.set(id, updated);
          return updated;
        },
      },
      storageReplicationJobRepository: {
        async findByTenantId(
          tenantId: string,
          pagination: PaginationOptions = {}
        ): Promise<PaginatedResult<StorageReplicationJob>> {
          const items = Array.from(storageReplicationJobs.values()).filter(
            (job) => job.tenant_id === tenantId
          );
          return paginate(items, pagination);
        },
        async findByTargetId(storageTargetId: string): Promise<StorageReplicationJob[]> {
          return Array.from(storageReplicationJobs.values()).filter(
            (job) => job.storage_target_id === storageTargetId
          );
        },
        async findPending(limit: number = 100): Promise<StorageReplicationJob[]> {
          return Array.from(storageReplicationJobs.values())
            .filter((job) => job.status === 'pending' || job.status === 'running')
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .slice(0, limit);
        },
        async create(data: Partial<StorageReplicationJob>): Promise<StorageReplicationJob> {
          const now = nowIso();
          const job: StorageReplicationJob = {
            id: randomUUID(),
            tenant_id: data.tenant_id ?? '',
            storage_target_id: data.storage_target_id ?? '',
            object_copy_id: data.object_copy_id ?? null,
            source_path: data.source_path ?? '',
            destination_path: data.destination_path ?? '',
            status: data.status ?? 'pending',
            attempts: data.attempts ?? 0,
            bytes_total: data.bytes_total ?? 0,
            bytes_transferred: data.bytes_transferred ?? 0,
            last_error: data.last_error ?? null,
            created_at: now,
            updated_at: now,
          };
          storageReplicationJobs.set(job.id, job);
          return job;
        },
        async updateStatus(
          id: string,
          status: StorageReplicationJob['status'],
          updates: {
            attempts?: number;
            bytes_transferred?: number;
            last_error?: string | null;
          } = {}
        ): Promise<StorageReplicationJob | null> {
          const existing = storageReplicationJobs.get(id);
          if (!existing) {
            return null;
          }
          const updated: StorageReplicationJob = {
            ...existing,
            status,
            attempts: updates.attempts ?? existing.attempts,
            bytes_transferred: updates.bytes_transferred ?? existing.bytes_transferred,
            last_error: updates.last_error !== undefined ? updates.last_error : existing.last_error,
            updated_at: nowIso(),
          };
          storageReplicationJobs.set(id, updated);
          return updated;
        },
      },
    },
  });
}, {
  name: 'repository-container-plugin',
});
