import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Alert Routes', () => {
  let server: FastifyInstance;
  const mockPolicyId = '550e8400-e29b-41d4-a716-446655440602';
  const mockIncidentId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440905';

  const adminToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'alert-admin@example.com',
      preferred_username: 'alert-admin',
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

  it('lists alert routes for a policy', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/policies/${mockPolicyId}/alert-routes`,
      headers: {
        authorization: `Bearer ${adminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('creates, updates, and deletes an alert route', async () => {
    const createResponse = await server.inject({
      method: 'POST',
      url: `/api/policies/${mockPolicyId}/alert-routes`,
      headers: {
        authorization: `Bearer ${adminToken}.mock.signature`,
      },
      payload: {
        channel: 'telegram',
        config: {
          chat_id: 'ops-room',
          stage: 'initial',
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body);
    expect(created.success).toBe(true);
    expect(created.data.channel).toBe('telegram');

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/policies/${mockPolicyId}/alert-routes/${created.data.id}`,
      headers: {
        authorization: `Bearer ${adminToken}.mock.signature`,
      },
      payload: {
        enabled: false,
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    const patched = JSON.parse(patchResponse.body);
    expect(patched.data.enabled).toBe(false);

    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: `/api/policies/${mockPolicyId}/alert-routes/${created.data.id}`,
      headers: {
        authorization: `Bearer ${adminToken}.mock.signature`,
      },
    });

    expect(deleteResponse.statusCode).toBe(200);
    const deleted = JSON.parse(deleteResponse.body);
    expect(deleted.data.deleted).toBe(true);
  });

  it('runs escalation chains for overdue incidents', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/incidents/escalations/run',
      headers: {
        authorization: `Bearer ${adminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.processed).toBeGreaterThan(0);
    expect(body.data.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          incident: expect.objectContaining({
            id: mockIncidentId,
          }),
          alerts: expect.arrayContaining([
            expect.objectContaining({
              stage: 'escalation',
              channel: 'slack',
              delivered: true,
            }),
          ]),
        }),
      ])
    );
  });
});
