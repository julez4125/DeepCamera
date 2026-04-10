import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('ML Routes', () => {
  let server: FastifyInstance;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';

  const investigatorToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440954',
      email: 'ml-investigator@example.com',
      preferred_username: 'ml-investigator',
      realm_access: { roles: ['investigator'] },
      groups: [],
      tenant_id: mockTenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'http://localhost:8080/auth/realms/ain-vr',
    })
  ).toString('base64');

  const modelAdminToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440955',
      email: 'model-admin@example.com',
      preferred_username: 'model-admin',
      realm_access: { roles: ['model-admin'] },
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

  it('returns model lifecycle overview', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/ml/overview',
      headers: {
        authorization: `Bearer ${investigatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.summary.models).toBeGreaterThan(0);
    expect(body.data.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: 'detector-yolo',
        }),
      ])
    );
  });

  it('runs the annotation-to-rollout pipeline', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/ml/pipeline/run',
      headers: {
        authorization: `Bearer ${modelAdminToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.created.annotations).toBeGreaterThan(0);
    expect(body.data.created.datasets).toBeGreaterThan(0);
    expect(body.data.created.training_jobs).toBeGreaterThan(0);
    expect(body.data.created.models).toBeGreaterThan(0);
    expect(body.data.created.deployments).toBeGreaterThan(0);
    expect(body.data.deployments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'canary',
        }),
      ])
    );
  });
});
