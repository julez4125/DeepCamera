import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';
import type { SiteRepository } from '../../db/repositories/index.js';

describe('Sites Routes', () => {
  let server: FastifyInstance;
  const mockSiteId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';

  const mockSite = {
    id: mockSiteId,
    tenant_id: mockTenantId,
    name: 'Test Site',
    address: '123 Main St',
    timezone: 'America/New_York',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'test@example.com',
      preferred_username: 'testuser',
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

  describe('GET /api/sites', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/sites',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return paginated sites for authenticated user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/sites?page=1&pageSize=20',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('data');
      expect(body.data).toHaveProperty('page');
      expect(body.data).toHaveProperty('pageSize');
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('hasMore');
    });
  });

  describe('POST /api/sites', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sites',
        payload: {
          name: 'New Site',
          address: '456 Oak Ave',
          timezone: 'America/Chicago',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should create site for security-admin', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sites',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          name: 'New Site',
          address: '456 Oak Ave',
          timezone: 'America/Chicago',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data.name).toBe('New Site');
    });

    it('should return 403 for non-admin roles', async () => {
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
        method: 'POST',
        url: '/api/sites',
        headers: {
          authorization: `Bearer ${viewerToken}.mock.signature`,
        },
        payload: {
          name: 'New Site',
          address: '456 Oak Ave',
          timezone: 'America/Chicago',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/sites/:id', () => {
    it('should return site detail for authenticated user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/sites/${mockSiteId}`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/sites/${mockSiteId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for non-existent site', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/sites/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/sites/:id', () => {
    it('should update site for security-admin', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/sites/${mockSiteId}`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          name: 'Updated Site Name',
          timezone: 'America/Los_Angeles',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Site Name');
    });

    it('should return 403 for non-admin roles', async () => {
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
        url: `/api/sites/${mockSiteId}`,
        headers: {
          authorization: `Bearer ${viewerToken}.mock.signature`,
        },
        payload: {
          name: 'Updated Site Name',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/sites/${mockSiteId}`,
        payload: {
          name: 'Updated Site Name',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/sites/:id', () => {
    it('should delete site for security-admin', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/api/sites/${mockSiteId}`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for non-admin roles', async () => {
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
        method: 'DELETE',
        url: `/api/sites/${mockSiteId}`,
        headers: {
          authorization: `Bearer ${viewerToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
