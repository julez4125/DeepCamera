import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Policies Routes', () => {
  let server: FastifyInstance;
  const mockPolicyId = '550e8400-e29b-41d4-a716-446655440601';
  const mockSiteId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440905';

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'policy@example.com',
      preferred_username: 'policy-admin',
      realm_access: { roles: ['platform-admin'] },
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

  it('lists policies for the authenticated tenant', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/policies',
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.data[0].id).toBe(mockPolicyId);
  });

  it('returns a single policy detail', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/policies/${mockPolicyId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(mockPolicyId);
    expect(body.data.site_id).toBe(mockSiteId);
  });

  it('creates a site-scoped policy', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/policies',
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
      payload: {
        site_id: mockSiteId,
        name: 'Perimeter Activity',
        conditions: {
          motion: true,
        },
        schedule: {
          timezone: 'Europe/Zurich',
        },
        severity_rules: {
          motion: 'high',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Perimeter Activity');
    expect(body.data.enabled).toBe(true);
    expect(body.data.armed_state).toBe('armed');
    expect(body.data.site_id).toBe(mockSiteId);
  });

  it('rejects writes for non-admin roles', async () => {
    const viewerToken = Buffer.from(
      JSON.stringify({
        sub: mockUserId,
        email: 'viewer@example.com',
        preferred_username: 'viewer',
        realm_access: { roles: ['viewer'] },
        groups: [],
        tenant_id: mockTenantId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'http://localhost:8080/auth/realms/ain-vr',
      })
    ).toString('base64');

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/policies/${mockPolicyId}`,
      headers: {
        authorization: `Bearer ${viewerToken}.mock.signature`,
      },
      payload: {
        enabled: false,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('updates a policy and returns the changed record', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/policies/${mockPolicyId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
      payload: {
        name: 'Updated Policy Name',
        enabled: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Policy Name');
    expect(body.data.enabled).toBe(false);
  });

  it('deletes a policy', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: `/api/policies/${mockPolicyId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});
