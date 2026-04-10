import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Search Routes', () => {
  let server: FastifyInstance;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockIncidentId = '550e8400-e29b-41d4-a716-446655440000';
  const mockEventId = '550e8400-e29b-41d4-a716-446655440551';

  const investigatorToken = Buffer.from(
    JSON.stringify({
      sub: '550e8400-e29b-41d4-a716-446655440904',
      email: 'investigator@example.com',
      preferred_username: 'investigator',
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
      sub: '550e8400-e29b-41d4-a716-446655440905',
      email: 'search-operator@example.com',
      preferred_username: 'search-operator',
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

  it('returns semantic search results with VLM summaries', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/search?q=unauthorized person after hours',
      headers: {
        authorization: `Bearer ${investigatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vlm_summary: expect.any(String),
        }),
      ])
    );
    expect(body.data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'incident',
        }),
      ])
    );
    expect(
      body.data.data.some((result: { vlm_summary: string | null }) =>
        typeof result.vlm_summary === 'string' && result.vlm_summary.toLowerCase().includes('after')
      )
    ).toBe(true);
  });

  it('lists enrichments for an incident', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/search/enrichments?incident_id=${mockIncidentId}`,
      headers: {
        authorization: `Bearer ${investigatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.data[0].incident_id).toBe(mockIncidentId);
  });

  it('processes queued enrichments and rebuilds the search index', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/search/enrichments/run',
      headers: {
        authorization: `Bearer ${operatorToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.processed).toBeGreaterThan(0);
    expect(body.data.enrichments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_id: mockEventId,
          status: 'completed',
        }),
      ])
    );

    const searchResponse = await server.inject({
      method: 'GET',
      url: '/api/search?q=clip evidence restricted area',
      headers: {
        authorization: `Bearer ${investigatorToken}.mock.signature`,
      },
    });

    expect(searchResponse.statusCode).toBe(200);
    const searchBody = JSON.parse(searchResponse.body);
    expect(searchBody.data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'clip',
        }),
      ])
    );
  });
});
