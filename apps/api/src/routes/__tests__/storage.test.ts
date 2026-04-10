import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Storage Routes', () => {
  let server: FastifyInstance;
  const mockTargetId = '550e8400-e29b-41d4-a716-446655440301';
  const mockSiteId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440903';

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'storage@example.com',
      preferred_username: 'storage-admin',
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

  it('lists storage targets', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/storage-targets',
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.data[0].id).toBe(mockTargetId);
  });

  it('creates a storage target', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/storage-targets',
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
      payload: {
        name: 'Edge NAS',
        target_type: 'nfs',
        config: {
          host: '10.0.0.10',
          share: '/exports/cameras',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.target_type).toBe('nfs');
  });

  it('tests connectivity for a storage target', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/storage-targets/${mockTargetId}/test`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
  });

  it('assigns a storage policy to a site', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: `/api/storage-targets/${mockTargetId}/assignments/sites/${mockSiteId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
      payload: {
        path_prefix: 'sites/test-site/archive',
        retention_days: 45,
        replication_enabled: true,
        priority: 50,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.retention_days).toBe(45);
  });

  it('returns storage health summary', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/storage/health',
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        assignment_count: expect.any(Number),
        pending_replications: expect.any(Number),
        failed_replications: expect.any(Number),
        replicated_objects: expect.any(Number),
        replicating_objects: expect.any(Number),
        degraded_objects: expect.any(Number),
        failed_objects: expect.any(Number),
      })
    );
  });

  it('lists storage object copies with status filters', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/storage/object-copies?status=replicated&target_id=${mockTargetId}`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.data[0]).toEqual(
      expect.objectContaining({
        storage_target_id: mockTargetId,
        copy_status: 'replicated',
      })
    );
  });
});
