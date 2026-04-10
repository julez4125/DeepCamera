import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Incidents Routes', () => {
  let server: FastifyInstance;
  const mockIncidentId = '550e8400-e29b-41d4-a716-446655440000';
  const mockSiteId = '550e8400-e29b-41d4-a716-446655440001';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockCameraId = '550e8400-e29b-41d4-a716-446655440003';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440004';

  const mockIncident = {
    id: mockIncidentId,
    tenant_id: mockTenantId,
    site_id: mockSiteId,
    severity: 'high',
    confidence: 0.95,
    category: 'intrusion',
    summary: 'Unauthorized person detected',
    status: 'open' as const,
    camera_ids: [mockCameraId],
    timeline_start: '2024-01-01T10:00:00Z',
    timeline_end: '2024-01-01T10:05:00Z',
    policy_hits: { policy_id: '123' },
    escalation_state: 'none',
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
  };

  const mockOperatorToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'operator@example.com',
      preferred_username: 'operator',
      realm_access: { roles: ['operator'] },
      groups: [],
      tenant_id: mockTenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'http://localhost:8080/auth/realms/ain-vr',
    })
  ).toString('base64');

  const mockAdminToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'admin@example.com',
      preferred_username: 'admin',
      realm_access: { roles: ['security-admin'] },
      groups: [],
      tenant_id: mockTenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'http://localhost:8080/auth/realms/ain-vr',
    })
  ).toString('base64');

  const mockViewerToken = Buffer.from(
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

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /api/incidents', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/incidents',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return paginated incidents for authenticated user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/incidents?page=1&pageSize=20',
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('data');
      expect(body.data).toHaveProperty('page');
      expect(body.data).toHaveProperty('total');
    });

    it('should filter incidents by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/incidents?status=open&page=1&pageSize=20',
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should filter incidents by severity', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/incidents?severity=high&page=1&pageSize=20',
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should filter incidents by site', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/incidents?site_id=${mockSiteId}&page=1&pageSize=20`,
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/incidents/:id', () => {
    it('should return incident detail', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/incidents/${mockIncidentId}`,
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('summary');
      expect(body.data).toHaveProperty('linked_events');
      expect(body.data).toHaveProperty('enrichments');
      expect(Array.isArray(body.data.enrichments)).toBe(true);
      expect(Array.isArray(body.data.evidence_references)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/incidents/${mockIncidentId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for non-existent incident', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/incidents/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/incidents/:id/ack', () => {
    it('should acknowledge incident for operator', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/ack`,
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('acknowledged');
    });

    it('should acknowledge incident for security-admin', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/ack`,
        headers: {
          authorization: `Bearer ${mockAdminToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 403 for viewer role', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/ack`,
        headers: {
          authorization: `Bearer ${mockViewerToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/ack`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/incidents/:id/escalate', () => {
    it('should escalate incident for operator', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/escalate`,
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.escalation_state).toBe('escalated');
    });

    it('should return 403 for viewer role', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/escalate`,
        headers: {
          authorization: `Bearer ${mockViewerToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/incidents/:id/close', () => {
    it('should close incident for security-admin', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/close`,
        headers: {
          authorization: `Bearer ${mockAdminToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('closed');
    });

    it('should return 403 for operator role', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/close`,
        headers: {
          authorization: `Bearer ${mockOperatorToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/incidents/${mockIncidentId}/close`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
