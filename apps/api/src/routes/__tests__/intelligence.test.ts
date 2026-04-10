import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Intelligence Routes', () => {
  let server: FastifyInstance;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockIncidentId = '550e8400-e29b-41d4-a716-446655440000';

  const investigatorToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440944',
      email: 'intelligence-investigator@example.com',
      preferred_username: 'intelligence-investigator',
      realm_access: { roles: ['investigator'] },
      groups: [],
      tenant_id: mockTenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'http://localhost:8080/auth/realms/ain-vr',
    })
  ).toString('base64');

  const operatorToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440945',
      email: 'intelligence-operator@example.com',
      preferred_username: 'intelligence-operator',
      realm_access: { roles: ['operator'] },
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

  it('returns specialized intelligence overview with watchlists and identity profiles', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/intelligence/overview',
      headers: {
        authorization: `Bearer ${investigatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.summary.watchlists).toBeGreaterThan(0);
    expect(body.data.summary.identity_profiles).toBeGreaterThan(0);
    expect(body.data.watchlists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'plate',
        }),
      ])
    );
  });

  it('processes specialized intelligence modules and produces optional outputs', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/intelligence/process',
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.created.plate_reads).toBeGreaterThan(0);
    expect(body.data.created.face_matches).toBeGreaterThan(0);
    expect(body.data.created.reid_links).toBeGreaterThan(0);
    expect(body.data.plate_reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          incident_id: mockIncidentId,
        }),
      ])
    );
  });

  it('filters the overview by incident after processing', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/intelligence/process',
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/intelligence/overview?incident_id=${mockIncidentId}`,
      headers: {
        authorization: `Bearer ${investigatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.plate_reads.every((plateRead: { incident_id: string | null }) => plateRead.incident_id === mockIncidentId)).toBe(true);
    expect(body.data.face_matches.every((faceMatch: { incident_id: string | null }) => faceMatch.incident_id === mockIncidentId)).toBe(true);
    expect(body.data.reid_links.every((reIdLink: { incident_id: string | null }) => reIdLink.incident_id === mockIncidentId)).toBe(true);
  });
});
