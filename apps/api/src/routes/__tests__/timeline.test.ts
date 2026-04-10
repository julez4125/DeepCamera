import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Timeline Routes', () => {
  let server: FastifyInstance;
  const cameraId = '550e8400-e29b-41d4-a716-446655440000';
  const clipId = '550e8400-e29b-41d4-a716-446655440901';
  const recordingId = '550e8400-e29b-41d4-a716-446655440801';
  const tenantId = '550e8400-e29b-41d4-a716-446655440002';
  const userId = '550e8400-e29b-41d4-a716-446655441010';

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: 'timeline@example.com',
      preferred_username: 'timeline-user',
      realm_access: { roles: ['viewer'] },
      groups: [],
      tenant_id: tenantId,
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

  it('lists recordings for a camera', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/cameras/${cameraId}/recordings`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.data[0].camera_id).toBe(cameraId);
    expect(body.data.data[0].playback.playback_url).toContain('/api/media/recordings/');
  });

  it('lists clips for a camera with playback metadata', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/cameras/${cameraId}/clips`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.data[0].playback.playback_url).toContain('/api/media/clips/');
  });

  it('returns clip detail', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/clips/${clipId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(clipId);
    expect(body.data.playback.preview_url).toContain('.jpg');
  });

  it('returns a timeline slice for a camera', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/timeline?camera_id=${cameraId}&date_from=2024-01-01T00:00:00.000Z&date_to=2024-01-02T00:00:00.000Z`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.camera_id).toBe(cameraId);
    expect(body.data.items.some((item: { type: string; id: string }) => item.type === 'clip')).toBe(
      true
    );
    expect(
      body.data.items.some(
        (item: { type: string; id: string; playback: { playback_url: string } }) =>
          item.type === 'recording' &&
          item.id === recordingId &&
          item.playback.playback_url.includes('/api/media/recordings/')
      )
    ).toBe(true);
  });
});
