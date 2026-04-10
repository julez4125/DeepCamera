import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('RBAC Middleware', () => {
  let server: FastifyInstance;

  const _testPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1PByf4dqvA8JSLfVla/Q
samebO0eRzWeqi+avIFy6s2UNCuUNKmPF+WOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
WOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWOWO
-----END PUBLIC KEY-----`;

  async function createTestToken(
    roles: string[] = ['viewer'],
    expiresIn = '1h'
  ): Promise<string> {
    const expiresInSeconds = expiresIn === '0s' ? 0 : 3600;
    const payload = {
      sub: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      preferred_username: 'testuser',
      realm_access: { roles },
      resource_access: {},
      groups: [],
      tenant_id: '550e8400-e29b-41d4-a716-446655440001',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      iss: 'http://localhost:8080/realms/ainvr',
    };

    return [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      'mock-signature',
    ].join('.');
  }

  beforeAll(async () => {
    process.env.KEYCLOAK_URL = 'http://localhost:8080';
    process.env.KEYCLOAK_REALM = 'ainvr';
    process.env.KEYCLOAK_CLIENT_ID = 'ainvr-web';
    process.env.KEYCLOAK_API_CLIENT_ID = 'ainvr-api';
    process.env.KEYCLOAK_API_CLIENT_SECRET = 'test-secret';
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('platform-admin should access all routes', async () => {
    const token = await createTestToken(['platform-admin']);

    const response = await server.inject({
      method: 'POST',
      url: '/api/cameras',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { name: 'Test Camera' },
    });

    // Should not be 403 Forbidden
    expect(response.statusCode).not.toBe(403);
  });

  it('viewer should NOT access POST /api/cameras', async () => {
    const token = await createTestToken(['viewer']);

    const response = await server.inject({
      method: 'POST',
      url: '/api/cameras',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { name: 'Test Camera' },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('correlationId');
  });

  it('operator should access POST /api/incidents/:id/ack', async () => {
    const token = await createTestToken(['operator']);

    const response = await server.inject({
      method: 'POST',
      url: '/api/incidents/123/ack',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {},
    });

    // Should not be 403 Forbidden
    expect(response.statusCode).not.toBe(403);
  });

  it('investigator should access GET /api/search', async () => {
    const token = await createTestToken(['investigator']);

    const response = await server.inject({
      method: 'GET',
      url: '/api/search',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    // Should not be 403 Forbidden
    expect(response.statusCode).not.toBe(403);
  });

  it('missing required role returns 403 with proper error body', async () => {
    const token = await createTestToken(['viewer']);

    const response = await server.inject({
      method: 'POST',
      url: '/api/incidents/123/ack',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('correlationId');
    expect(body.code).toMatch(/FORBIDDEN|UNAUTHORIZED/);
  });

  it('role check uses server-side data for defense in depth', async () => {
    // Even if token claims a role, we validate against server-side mappings
    const token = await createTestToken(['unknown-role']);

    const response = await server.inject({
      method: 'POST',
      url: '/api/cameras',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { name: 'Test Camera' },
    });

    // Should be forbidden since unknown-role doesn't map to write:cameras
    expect(response.statusCode).toBe(403);
  });
});
