import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  tenantSchema,
  type Tenant,
} from '../domains/tenant';
import {
  siteSchema,
  type Site,
} from '../domains/site';
import {
  cameraSchema,
  type Camera,
} from '../domains/camera';
import {
  zoneSchema,
  type Zone,
} from '../domains/zone';
import {
  eventSchema,
  type Event,
} from '../domains/event';
import {
  detectionSchema,
  type Detection,
} from '../domains/detection';
import {
  incidentSchema,
  type Incident,
} from '../domains/incident';
import {
  enrichmentSchema,
  type Enrichment,
} from '../domains/enrichment';
import {
  semanticSearchResultSchema,
  type SemanticSearchResult,
} from '../domains/search';
import {
  watchlistSchema,
  type Watchlist,
  identityProfileSchema,
  type IdentityProfile,
  plateReadSchema,
  type PlateRead,
  faceMatchSchema,
  type FaceMatch,
  reIdTrackLinkSchema,
  type ReIdTrackLink,
} from '../domains/specialized-intelligence';
import {
  annotationTaskSchema,
  type AnnotationTask,
  datasetVersionSchema,
  type DatasetVersion,
  trainingJobSchema,
  type TrainingJob,
  modelRegistryEntrySchema,
  type ModelRegistryEntry,
  modelDeploymentSchema,
  type ModelDeployment,
} from '../domains/model-lifecycle';
import {
  paginationParamsSchema,
  paginatedResponseSchema,
} from '../common/pagination';
import {
  standardErrorSchema,
} from '../common/error-envelope';

describe('Domain Schemas', () => {
  describe('Tenant Schema', () => {
    it('should parse valid tenant data', () => {
      const validTenant = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'ACME Corp',
        slug: 'acme-corp',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result = tenantSchema.parse(validTenant);
      expect(result).toBeDefined();
      expect(result.id).toBe(validTenant.id);
      expect(result.name).toBe(validTenant.name);
    });

    it('should reject tenant data missing required field', () => {
      const invalidTenant = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        // missing name
        slug: 'acme-corp',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => tenantSchema.parse(invalidTenant)).toThrow(ZodError);
    });
  });

  describe('Site Schema', () => {
    it('should parse valid site data', () => {
      const validSite = {
        id: '223e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Main Office',
        address: '123 Main St, New York, NY 10001',
        timezone: 'America/New_York',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result = siteSchema.parse(validSite);
      expect(result).toBeDefined();
      expect(result.name).toBe('Main Office');
      expect(result.timezone).toBe('America/New_York');
    });

    it('should reject site data missing required field', () => {
      const invalidSite = {
        id: '223e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Main Office',
        // missing address
        timezone: 'America/New_York',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => siteSchema.parse(invalidSite)).toThrow(ZodError);
    });
  });

  describe('Camera Schema', () => {
    it('should parse valid camera data', () => {
      const validCamera = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Entrance Camera',
        stream_url: 'rtsp://camera.example.com:554/stream',
        protocol: 'rtsp' as const,
        status: 'online' as const,
        detection_enabled: true,
        recording_enabled: true,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result = cameraSchema.parse(validCamera);
      expect(result).toBeDefined();
      expect(result.protocol).toBe('rtsp');
      expect(result.status).toBe('online');
      expect(result.detection_enabled).toBe(true);
    });

    it('should reject camera data missing required field', () => {
      const invalidCamera = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Entrance Camera',
        // missing stream_url
        protocol: 'rtsp',
        status: 'online',
        detection_enabled: true,
        recording_enabled: true,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => cameraSchema.parse(invalidCamera)).toThrow(ZodError);
    });
  });

  describe('Zone Schema', () => {
    it('should parse valid zone data', () => {
      const validZone = {
        id: '423e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Entry Zone',
        polygon: { coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] },
        zone_type: 'entry' as const,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result = zoneSchema.parse(validZone);
      expect(result).toBeDefined();
      expect(result.zone_type).toBe('entry');
    });

    it('should reject zone data missing required field', () => {
      const invalidZone = {
        id: '423e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        // missing name
        polygon: { coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] },
        zone_type: 'entry',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => zoneSchema.parse(invalidZone)).toThrow(ZodError);
    });
  });

  describe('Event Schema', () => {
    it('should parse valid event data', () => {
      const validEvent = {
        id: '523e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        payload: { detected_objects: ['person', 'vehicle'] },
        severity: 'high' as const,
        correlation_id: '623e4567-e89b-12d3-a456-426614174000',
        created_at: '2024-01-15T10:30:00Z',
      };

      const result = eventSchema.parse(validEvent);
      expect(result).toBeDefined();
      expect(result.severity).toBe('high');
      expect(result.event_type).toBe('detection.created');
    });

    it('should reject event data missing required field', () => {
      const invalidEvent = {
        id: '523e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        // missing event_type
        timestamp: '2024-01-15T10:30:00Z',
        payload: { detected_objects: ['person'] },
        severity: 'high',
        correlation_id: '623e4567-e89b-12d3-a456-426614174000',
        created_at: '2024-01-15T10:30:00Z',
      };

      expect(() => eventSchema.parse(invalidEvent)).toThrow(ZodError);
    });
  });

  describe('Detection Schema', () => {
    it('should parse valid detection data', () => {
      const validDetection = {
        id: '623e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        snapshot_id: '823e4567-e89b-12d3-a456-426614174000',
        clip_id: null,
        recording_id: null,
        label: 'person',
        confidence: 0.91,
        bounding_box: {
          x: 0.12,
          y: 0.18,
          width: 0.22,
          height: 0.41,
        },
        zone_ids: ['423e4567-e89b-12d3-a456-426614174000'],
        source: 'snapshot',
        model: 'detector-yolo-fallback',
        track_id: 'track-1',
        latency_ms: 28,
        frame_timestamp: '2024-01-15T10:30:00Z',
        created_at: '2024-01-15T10:30:00Z',
      };

      const result = detectionSchema.parse(validDetection);
      expect(result).toBeDefined();
      expect(result.label).toBe('person');
      expect(result.zone_ids).toHaveLength(1);
    });

    it('should reject invalid detection confidence', () => {
      const invalidDetection = {
        id: '623e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        label: 'person',
        confidence: 1.5,
        bounding_box: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 },
        zone_ids: [],
        source: 'frame',
        model: 'detector-yolo-fallback',
        latency_ms: 14,
        frame_timestamp: '2024-01-15T10:30:00Z',
        created_at: '2024-01-15T10:30:00Z',
      };

      expect(() => detectionSchema.parse(invalidDetection)).toThrow(ZodError);
    });
  });

  describe('Incident Schema', () => {
    it('should parse valid incident data', () => {
      const validIncident = {
        id: '723e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        severity: 'critical',
        confidence: 0.95,
        category: 'intrusion',
        summary: 'Unauthorized access attempt',
        status: 'open' as const,
        camera_ids: ['323e4567-e89b-12d3-a456-426614174000'],
        timeline_start: '2024-01-15T10:30:00Z',
        timeline_end: '2024-01-15T10:35:00Z',
        policy_hits: { 'restricted-zone': true },
        escalation_state: 'scheduled',
        linked_event_ids: ['523e4567-e89b-12d3-a456-426614174000'],
        evidence_references: [
          {
            kind: 'clip',
            clip_id: '923e4567-e89b-12d3-a456-426614174000',
            snapshot_id: null,
            recording_id: null,
            path: '/clips/incident.mp4',
            playback_url: '/api/media/clips/923e4567-e89b-12d3-a456-426614174000/playback',
          },
        ],
        dedupe_count: 2,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result = incidentSchema.parse(validIncident);
      expect(result).toBeDefined();
      expect(result.status).toBe('open');
      expect(result.confidence).toBe(0.95);
    });

    it('should reject incident data missing required field', () => {
      const invalidIncident = {
        id: '723e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        severity: 'critical',
        // missing confidence
        category: 'intrusion',
        summary: 'Unauthorized access attempt',
        status: 'open',
        camera_ids: ['323e4567-e89b-12d3-a456-426614174000'],
        timeline_start: '2024-01-15T10:30:00Z',
        timeline_end: '2024-01-15T10:35:00Z',
        policy_hits: { 'restricted-zone': true },
        escalation_state: 'scheduled',
        linked_event_ids: [],
        evidence_references: [],
        dedupe_count: 1,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => incidentSchema.parse(invalidIncident)).toThrow(ZodError);
    });
  });

  describe('Enrichment Schema', () => {
    it('should parse valid enrichment data', () => {
      const validEnrichment = {
        id: '723e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        source_type: 'incident' as const,
        source_id: '523e4567-e89b-12d3-a456-426614174000',
        incident_id: '523e4567-e89b-12d3-a456-426614174000',
        event_id: null,
        clip_id: '923e4567-e89b-12d3-a456-426614174000',
        snapshot_id: null,
        recording_id: null,
        status: 'completed' as const,
        model: 'vlm-fallback-v1' as const,
        summary: 'A person is moving through a restricted entrance after hours.',
        suspicious_context: ['after_hours', 'restricted_zone'],
        keywords: ['person', 'intrusion', 'clip'],
        semantic_terms: ['person', 'human', 'intrusion'],
        queued_at: '2024-01-15T10:30:00Z',
        started_at: '2024-01-15T10:30:01Z',
        completed_at: '2024-01-15T10:30:03Z',
        error_message: null,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:03Z',
      };

      const result: Enrichment = enrichmentSchema.parse(validEnrichment);
      expect(result.status).toBe('completed');
      expect(result.suspicious_context).toContain('after_hours');
    });

    it('should reject invalid enrichment source type', () => {
      const invalidEnrichment = {
        id: '723e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        source_type: 'clip',
        source_id: '523e4567-e89b-12d3-a456-426614174000',
        incident_id: null,
        event_id: null,
        clip_id: null,
        snapshot_id: null,
        recording_id: null,
        status: 'queued',
        model: 'vlm-fallback-v1',
        summary: null,
        suspicious_context: [],
        keywords: [],
        semantic_terms: [],
        queued_at: '2024-01-15T10:30:00Z',
        started_at: null,
        completed_at: null,
        error_message: null,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => enrichmentSchema.parse(invalidEnrichment)).toThrow(ZodError);
    });
  });

  describe('Semantic Search Schema', () => {
    it('should parse valid semantic search result data', () => {
      const validResult = {
        id: '823e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        source_type: 'incident' as const,
        source_id: '523e4567-e89b-12d3-a456-426614174000',
        incident_id: '523e4567-e89b-12d3-a456-426614174000',
        event_id: null,
        clip_id: '923e4567-e89b-12d3-a456-426614174000',
        camera_ids: ['323e4567-e89b-12d3-a456-426614174000'],
        severity: 'high',
        title: 'High severity intrusion incident',
        summary: 'Unauthorized person detected near the main entrance.',
        occurred_at: '2024-01-15T10:30:00Z',
        keywords: ['intrusion', 'person'],
        semantic_terms: ['intrusion', 'unauthorized', 'person'],
        matched_terms: ['unauthorized', 'person'],
        score: 0.91,
        vlm_summary: 'The clip shows a person crossing the perimeter line.',
        suspicious_context: ['restricted_zone'],
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result: SemanticSearchResult = semanticSearchResultSchema.parse(validResult);
      expect(result.source_type).toBe('incident');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should reject negative semantic search score', () => {
      const invalidResult = {
        id: '823e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        source_type: 'event',
        source_id: '523e4567-e89b-12d3-a456-426614174000',
        incident_id: null,
        event_id: '523e4567-e89b-12d3-a456-426614174000',
        clip_id: null,
        camera_ids: ['323e4567-e89b-12d3-a456-426614174000'],
        severity: 'medium',
        title: 'Event',
        summary: 'Summary',
        occurred_at: '2024-01-15T10:30:00Z',
        keywords: [],
        semantic_terms: [],
        matched_terms: [],
        score: -0.1,
        vlm_summary: null,
        suspicious_context: [],
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      expect(() => semanticSearchResultSchema.parse(invalidResult)).toThrow(ZodError);
    });
  });

  describe('Specialized Intelligence Schemas', () => {
    it('should parse valid watchlist data', () => {
      const validWatchlist = {
        id: '923e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        kind: 'plate' as const,
        name: 'Denied Vehicle Watchlist',
        description: 'Vehicles blocked after hours.',
        disposition: 'deny' as const,
        severity: 'critical' as const,
        enabled: true,
        entries: ['BER-AI-247'],
        tags: ['gate', 'after_hours'],
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result: Watchlist = watchlistSchema.parse(validWatchlist);
      expect(result.kind).toBe('plate');
      expect(result.entries).toContain('BER-AI-247');
      expect(result.tags).toContain('gate');
    });

    it('should parse valid identity profile data', () => {
      const validProfile = {
        id: 'a23e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'person' as const,
        display_name: 'Alex Mercer',
        reference_key: 'employee-2471',
        enrollment_status: 'active' as const,
        watchlist_ids: ['923e4567-e89b-12d3-a456-426614174000'],
        notes: 'Opt-in executive access profile.',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const result: IdentityProfile = identityProfileSchema.parse(validProfile);
      expect(result.enrollment_status).toBe('active');
      expect(result.watchlist_ids).toHaveLength(1);
    });

    it('should parse valid plate read data', () => {
      const validPlateRead = {
        id: 'b23e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        event_id: '523e4567-e89b-12d3-a456-426614174000',
        incident_id: '623e4567-e89b-12d3-a456-426614174000',
        watchlist_id: '923e4567-e89b-12d3-a456-426614174000',
        plate_text: 'BER-AI-247',
        plate_region: 'DE-BE',
        confidence: 0.93,
        direction: 'entering' as const,
        vehicle_type: 'sedan',
        occurred_at: '2024-01-15T10:30:00Z',
        created_at: '2024-01-15T10:30:00Z',
        metadata: { lane: 'north' },
      };

      const result: PlateRead = plateReadSchema.parse(validPlateRead);
      expect(result.plate_text).toBe('BER-AI-247');
      expect(result.direction).toBe('entering');
    });

    it('should parse valid face match data', () => {
      const validFaceMatch = {
        id: 'c23e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        event_id: '523e4567-e89b-12d3-a456-426614174000',
        incident_id: null,
        identity_profile_id: 'a23e4567-e89b-12d3-a456-426614174000',
        watchlist_id: null,
        subject_label: 'Alex Mercer',
        confidence: 0.88,
        status: 'match' as const,
        occurred_at: '2024-01-15T10:30:00Z',
        created_at: '2024-01-15T10:30:00Z',
        metadata: { zone: 'lobby' },
      };

      const result: FaceMatch = faceMatchSchema.parse(validFaceMatch);
      expect(result.status).toBe('match');
      expect(result.subject_label).toBe('Alex Mercer');
    });

    it('should parse valid re-id track link data', () => {
      const validReIdLink = {
        id: 'd23e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        incident_id: '623e4567-e89b-12d3-a456-426614174000',
        origin_camera_id: '323e4567-e89b-12d3-a456-426614174000',
        target_camera_id: '423e4567-e89b-12d3-a456-426614174000',
        origin_event_id: '523e4567-e89b-12d3-a456-426614174000',
        target_event_id: '723e4567-e89b-12d3-a456-426614174000',
        source_track_id: 'track-alpha',
        target_track_id: 'track-bravo',
        confidence: 0.79,
        status: 'linked' as const,
        movement_hint: 'Front Door -> Operations Entrance in 42 seconds',
        travel_time_seconds: 42,
        occurred_at: '2024-01-15T10:30:00Z',
        created_at: '2024-01-15T10:30:00Z',
        metadata: { path: ['front-door', 'ops-entry'] },
      };

      const result: ReIdTrackLink = reIdTrackLinkSchema.parse(validReIdLink);
      expect(result.status).toBe('linked');
      expect(result.travel_time_seconds).toBe(42);
    });
  });

  describe('Model Lifecycle Schemas', () => {
    it('should parse valid annotation task data', () => {
      const validAnnotationTask = {
        id: 'e23e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        site_id: '223e4567-e89b-12d3-a456-426614174000',
        camera_id: '323e4567-e89b-12d3-a456-426614174000',
        incident_id: '623e4567-e89b-12d3-a456-426614174000',
        clip_id: '723e4567-e89b-12d3-a456-426614174000',
        snapshot_id: null,
        recording_id: null,
        source_type: 'incident' as const,
        label_schema: ['person', 'vehicle'],
        status: 'review' as const,
        priority: 'high' as const,
        assigned_to: 'reviewer@example.com',
        notes: 'Cross-check masks before export.',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:35:00Z',
      };

      const result: AnnotationTask = annotationTaskSchema.parse(validAnnotationTask);
      expect(result.status).toBe('review');
      expect(result.label_schema).toContain('person');
    });

    it('should parse valid dataset version data', () => {
      const validDatasetVersion = {
        id: 'f23e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Ops perimeter dataset',
        version: '2024.01-r2',
        annotation_task_ids: ['e23e4567-e89b-12d3-a456-426614174000'],
        label_count: 128,
        class_distribution: { person: 64, vehicle: 32, bag: 32 },
        status: 'ready' as const,
        storage_uri: 's3://datasets/ops/perimeter/2024.01-r2',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:35:00Z',
      };

      const result: DatasetVersion = datasetVersionSchema.parse(validDatasetVersion);
      expect(result.status).toBe('ready');
      expect(result.label_count).toBe(128);
    });

    it('should parse valid training job data', () => {
      const validTrainingJob = {
        id: '123e4567-e89b-12d3-a456-426614174999',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        dataset_version_id: 'f23e4567-e89b-12d3-a456-426614174000',
        model_family: 'detector-yolo',
        status: 'completed' as const,
        metrics: { mAP50: 0.81, recall: 0.78 },
        output_model_id: '223e4567-e89b-12d3-a456-426614174999',
        started_at: '2024-01-15T10:30:00Z',
        completed_at: '2024-01-15T11:00:00Z',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T11:00:00Z',
      };

      const result: TrainingJob = trainingJobSchema.parse(validTrainingJob);
      expect(result.status).toBe('completed');
      expect(result.metrics['mAP50']).toBe(0.81);
    });

    it('should parse valid model registry entry data', () => {
      const validModel = {
        id: '223e4567-e89b-12d3-a456-426614174999',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Ops Detector',
        family: 'detector-yolo',
        version: '2024.01-r2',
        format: 'onnx',
        source_training_job_id: '123e4567-e89b-12d3-a456-426614174999',
        stage: 'staging' as const,
        metrics: { mAP50: 0.81 },
        metadata: { exported_by: 'phase10-pipeline' },
        created_at: '2024-01-15T11:00:00Z',
        updated_at: '2024-01-15T11:00:00Z',
      };

      const result: ModelRegistryEntry = modelRegistryEntrySchema.parse(validModel);
      expect(result.stage).toBe('staging');
      expect(result.family).toBe('detector-yolo');
    });

    it('should parse valid model deployment data', () => {
      const validDeployment = {
        id: '323e4567-e89b-12d3-a456-426614174999',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        model_id: '223e4567-e89b-12d3-a456-426614174999',
        worker_type: 'detector-yolo',
        status: 'canary' as const,
        rollout_strategy: 'canary' as const,
        target_scope: 'site' as const,
        target_id: '223e4567-e89b-12d3-a456-426614174000',
        config: { sample_ratio: 0.2 },
        created_at: '2024-01-15T11:05:00Z',
        updated_at: '2024-01-15T11:05:00Z',
      };

      const result: ModelDeployment = modelDeploymentSchema.parse(validDeployment);
      expect(result.status).toBe('canary');
      expect(result.rollout_strategy).toBe('canary');
    });
  });

  describe('Pagination Schemas', () => {
    it('should parse valid pagination params', () => {
      const params = {
        page: 2,
        pageSize: 50,
      };

      const result = paginationParamsSchema.parse(params);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
    });

    it('should apply defaults for pagination params', () => {
      const params = {};

      const result = paginationParamsSchema.parse(params);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should parse valid paginated response', () => {
      const tenantPaginationSchema = paginatedResponseSchema(tenantSchema);

      const response = {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Tenant 1',
            slug: 'tenant-1',
            created_at: '2024-01-15T10:30:00Z',
            updated_at: '2024-01-15T10:30:00Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasMore: false,
      };

      const result = tenantPaginationSchema.parse(response);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Error Envelope Schema', () => {
    it('should parse valid error envelope', () => {
      const error = {
        code: 'INVALID_REQUEST',
        message: 'Request validation failed',
        details: { field: 'email', reason: 'invalid format' },
        correlationId: '823e4567-e89b-12d3-a456-426614174000',
        retriable: false,
      };

      const result = standardErrorSchema.parse(error);
      expect(result.code).toBe('INVALID_REQUEST');
      expect(result.retriable).toBe(false);
    });

    it('should parse error envelope with optional fields', () => {
      const error = {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        correlationId: '923e4567-e89b-12d3-a456-426614174000',
      };

      const result = standardErrorSchema.parse(error);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.details).toBeUndefined();
      expect(result.retriable).toBe(false);
    });
  });
});
