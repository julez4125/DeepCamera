import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Streams Routes', () => {
  let server: FastifyInstance;
  const mockCameraId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440902';

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'streams@example.com',
      preferred_username: 'streams-user',
      realm_access: { roles: ['viewer'] },
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

  it('returns stream metadata for a camera', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/streams`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.camera_id).toBe(mockCameraId);
    expect(body.data.streams[0].metadata.protocol).toBe('rtsp');
  });
});
