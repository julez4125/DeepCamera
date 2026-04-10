import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Audit Routes', () => {
  let server: FastifyInstance;
  const tenantTwoId = '550e8400-e29b-41d4-a716-446655440002';

  const platformAdminToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440955',
      email: 'audit-admin@example.com',
      preferred_username: 'audit-admin',
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

  it('filters audit logs by action', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/audit-logs?action=UPDATE',
      headers: {
        authorization: `Bearer ${platformAdminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.data).toHaveLength(1);
    expect(body.data.data[0].action).toBe('UPDATE');
  });

  it('returns audit summary by action and resource', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/audit-logs/summary',
      headers: {
        authorization: `Bearer ${platformAdminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'UPDATE', count: expect.any(Number) }),
      ])
    );
    expect(body.data.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource_type: 'storage_target', count: expect.any(Number) }),
      ])
    );
  });
});
