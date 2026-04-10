import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Events Routes', () => {
  let server: FastifyInstance;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440904';
  const mockCameraId = '550e8400-e29b-41d4-a716-446655440003';
  const mockZoneId = '550e8400-e29b-41d4-a716-446655440102';
  const mockClipId = '550e8400-e29b-41d4-a716-446655440902';
  const mockRecordingId = '550e8400-e29b-41d4-a716-446655440802';

  const operatorToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'wavec-operator@example.com',
      preferred_username: 'wavec-operator',
      realm_access: { roles: ['operator'] },
      groups: [],
      tenant_id: mockTenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'http://localhost:8080/auth/realms/ain-vr',
    })
  ).toString('base64');

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('lists persisted detection events for the tenant', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/events?camera_id=${mockCameraId}`,
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.data[0].event_type).toBe('detection.created');
  });

  it('ingests detections, normalizes an event, creates an incident, and dispatches initial alerts', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/events/ingest-detections',
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
      payload: {
        camera_id: mockCameraId,
        timestamp: '2024-01-01T10:06:00.000Z',
        clip_id: mockClipId,
        recording_id: mockRecordingId,
        detections: [
          {
            label: 'person',
            confidence: 0.93,
            bounding_box: {
              x: 0.16,
              y: 0.21,
              width: 0.23,
              height: 0.42,
            },
            zone_ids: [mockZoneId],
          },
        ],
        metrics: {
          model: 'detector-yolo-fallback',
          processing_ms: 31,
          fps: 7.5,
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.event.event_type).toBe('detection.created');
    expect(body.data.matched_policies).toHaveLength(1);
    expect(body.data.incident.linked_event_ids).toContain(body.data.event.id);
    expect(body.data.incident.evidence_references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'clip',
          clip_id: mockClipId,
        }),
      ])
    );
    expect(body.data.queued_enrichments.length).toBeGreaterThan(0);
    expect(body.data.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'webhook',
          delivered: true,
          stage: 'initial',
        }),
      ])
    );
  });

  it('dedupes repeated detections into the same open incident', async () => {
    const firstResponse = await server.inject({
      method: 'POST',
      url: '/api/events/ingest-detections',
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
      payload: {
        camera_id: mockCameraId,
        timestamp: '2024-01-01T10:07:00.000Z',
        clip_id: mockClipId,
        recording_id: mockRecordingId,
        detections: [
          {
            label: 'person',
            confidence: 0.9,
            bounding_box: {
              x: 0.18,
              y: 0.23,
              width: 0.22,
              height: 0.4,
            },
            zone_ids: [mockZoneId],
          },
        ],
      },
    });

    const secondResponse = await server.inject({
      method: 'POST',
      url: '/api/events/ingest-detections',
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
      payload: {
        camera_id: mockCameraId,
        timestamp: '2024-01-01T10:07:30.000Z',
        clip_id: mockClipId,
        recording_id: mockRecordingId,
        detections: [
          {
            label: 'person',
            confidence: 0.92,
            bounding_box: {
              x: 0.19,
              y: 0.22,
              width: 0.23,
              height: 0.39,
            },
            zone_ids: [mockZoneId],
          },
        ],
      },
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(201);

    const firstBody = JSON.parse(firstResponse.body);
    const secondBody = JSON.parse(secondResponse.body);
    expect(secondBody.data.deduped).toBe(true);
    expect(secondBody.data.incident.id).toBe(firstBody.data.incident.id);
    expect(secondBody.data.incident.dedupe_count).toBeGreaterThan(1);
  });
});
