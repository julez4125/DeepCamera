import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Zones Routes', () => {
  let server: FastifyInstance;
  const mockSiteId = '550e8400-e29b-41d4-a716-446655440000';
  const mockZoneId = '550e8400-e29b-41d4-a716-446655440101';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440901';

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'zones@example.com',
      preferred_username: 'zones-admin',
      realm_access: { roles: ['security-admin'] },
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

  it('lists zones for a tenant-scoped site', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/sites/${mockSiteId}/zones`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.data)).toBe(true);
  });

  it('creates a new zone', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/sites/${mockSiteId}/zones`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
      payload: {
        name: 'Restricted Hallway',
        polygon: { points: [[2, 2], [4, 2], [4, 4], [2, 4]] },
        zone_type: 'restricted',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Restricted Hallway');
  });

  it('returns zone detail', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/zones/${mockZoneId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(mockZoneId);
  });
});
