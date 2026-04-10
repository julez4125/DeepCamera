import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Enterprise Hardening Routes', () => {
  let server: FastifyInstance;
  const tenantTwoId = '550e8400-e29b-41d4-a716-446655440002';

  const platformAdminToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440955',
      email: 'platform-admin@example.com',
      preferred_username: 'platform-admin',
      realm_access: { roles: ['platform-admin'] },
      groups: [],
      tenant_id: tenantTwoId,
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

  it('returns tenant-scoped observability overview', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/observability/overview',
      headers: {
        authorization: `Bearer ${platformAdminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.scope_tenant_id).toBe(tenantTwoId);
    expect(body.data.summary.open_incident_count).toBeGreaterThan(0);
    expect(body.data.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'storage' }),
      ])
    );
  });

  it('returns tenant hardening overview across tenants', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/tenants/hardening',
      headers: {
        authorization: `Bearer ${platformAdminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.summary.tenant_count).toBeGreaterThanOrEqual(2);
    expect(body.data.tenants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenant: expect.objectContaining({ id: tenantTwoId }),
          quota: expect.objectContaining({ max_sites: expect.any(Number) }),
        }),
      ])
    );
  });

  it('updates tenant quota configuration', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: `/api/tenants/${tenantTwoId}/quotas`,
      headers: {
        authorization: `Bearer ${platformAdminToken}.mock.signature`,
      },
      payload: {
        max_sites: 10,
        max_storage_targets: 8,
        enabled_modules: ['timeline', 'search', 'training'],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.max_sites).toBe(10);
    expect(body.data.max_storage_targets).toBe(8);
    expect(body.data.enabled_modules).toContain('training');
  });
});
