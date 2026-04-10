import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  eventEnvelopeSchema,
  eventTypeSchema,
  type EventType,
} from '../events/event-envelope';

describe('Event Envelope Schema', () => {
  describe('EventType Enum', () => {
    it('should accept camera.online event type', () => {
      const eventType = 'camera.online' as const;
      const result = eventTypeSchema.parse(eventType);
      expect(result).toBe('camera.online');
    });

    it('should accept camera.offline event type', () => {
      const eventType = 'camera.offline' as const;
      const result = eventTypeSchema.parse(eventType);
      expect(result).toBe('camera.offline');
    });

    it('should accept detection.created event type', () => {
      const eventType = 'detection.created' as const;
      const result = eventTypeSchema.parse(eventType);
      expect(result).toBe('detection.created');
    });

    it('should accept incident.created event type', () => {
      const eventType = 'incident.created' as const;
      const result = eventTypeSchema.parse(eventType);
      expect(result).toBe('incident.created');
    });

    it('should accept alert.sent event type', () => {
      const eventType = 'alert.sent' as const;
      const result = eventTypeSchema.parse(eventType);
      expect(result).toBe('alert.sent');
    });

    it('should accept all valid EventType enum values', () => {
      const validEventTypes: EventType[] = [
        'camera.online',
        'camera.offline',
        'stream.degraded',
        'frame.captured',
        'detection.created',
        'track.updated',
        'face.matched',
        'plate.read',
        'reid.linked',
        'vlm.summary_ready',
        'incident.created',
        'incident.updated',
        'alert.sent',
        'annotation.completed',
        'training.job_updated',
        'model.deployment_updated',
        'skill.failed',
        'worker.overloaded',
      ];

      validEventTypes.forEach((eventType) => {
        const result = eventTypeSchema.parse(eventType);
        expect(result).toBe(eventType);
      });
    });

    it('should reject invalid event type', () => {
      const invalidEventType = 'invalid.event.type';
      expect(() => eventTypeSchema.parse(invalidEventType)).toThrow(ZodError);
    });
  });

  describe('Event Envelope', () => {
    it('should parse valid event envelope', () => {
      const validEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created' as const,
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {
          detected_objects: ['person', 'vehicle'],
          confidence: 0.92,
        },
      };

      const result = eventEnvelopeSchema.parse(validEnvelope);
      expect(result).toBeDefined();
      expect(result.event_type).toBe('detection.created');
      expect(result.payload['detected_objects']).toEqual(['person', 'vehicle']);
    });

    it('should parse event envelope with minimal payload', () => {
      const validEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'camera.online' as const,
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      const result = eventEnvelopeSchema.parse(validEnvelope);
      expect(result.payload).toEqual({});
    });

    it('should reject envelope with invalid event_type', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'invalid.type',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing event_id', () => {
      const invalidEnvelope = {
        // missing event_id
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing event_type', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        // missing event_type
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing timestamp', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        // missing timestamp
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing tenant_id', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        // missing tenant_id
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing site_id', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        // missing site_id
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing camera_id', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        // missing camera_id
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing correlation_id', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        // missing correlation_id
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope missing payload', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        // missing payload
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope with invalid UUID fields', () => {
      const invalidEnvelope = {
        event_id: 'not-a-uuid',
        event_type: 'detection.created',
        timestamp: '2024-01-15T10:30:00Z',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });

    it('should reject envelope with invalid timestamp', () => {
      const invalidEnvelope = {
        event_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'detection.created',
        timestamp: 'not-a-valid-timestamp',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        site_id: '323e4567-e89b-12d3-a456-426614174000',
        camera_id: '423e4567-e89b-12d3-a456-426614174000',
        correlation_id: '523e4567-e89b-12d3-a456-426614174000',
        payload: {},
      };

      expect(() =>
        eventEnvelopeSchema.parse(invalidEnvelope),
      ).toThrow(ZodError);
    });
  });
});
