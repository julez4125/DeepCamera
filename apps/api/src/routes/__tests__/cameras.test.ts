import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Cameras Routes', () => {
  let server: FastifyInstance;
  const mockCameraId = '550e8400-e29b-41d4-a716-446655440000';
  const mockSiteId = '550e8400-e29b-41d4-a716-446655440001';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440003';

  const mockCamera = {
    id: mockCameraId,
    site_id: mockSiteId,
    name: 'Front Door',
    stream_url: 'rtsp://192.168.1.100:554/stream',
    protocol: 'rtsp' as const,
    status: 'online' as const,
    detection_enabled: true,
    recording_enabled: true,
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

  describe('GET /api/cameras', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/cameras',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return cameras for authenticated user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/cameras?site_id=${mockSiteId}`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('data');
      expect(Array.isArray(body.data.data)).toBe(true);
    });

    it('should filter cameras by site_id', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/cameras?site_id=${mockSiteId}&page=1&pageSize=10`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.data).toBeDefined();
    });
  });

  describe('POST /api/cameras', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/cameras',
        payload: {
          site_id: mockSiteId,
          name: 'Backyard',
          stream_url: 'rtsp://192.168.1.101:554/stream',
          protocol: 'rtsp',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should create camera for security-admin', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/cameras',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          site_id: mockSiteId,
          name: 'Backyard',
          stream_url: 'rtsp://192.168.1.101:554/stream',
          protocol: 'rtsp',
          detection_enabled: true,
          recording_enabled: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Backyard');
      expect(body.data.live.endpoints.webrtc_url).toContain(body.data.id);
    });

    it('should return 403 for viewer role', async () => {
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
        url: '/api/cameras',
        headers: {
          authorization: `Bearer ${viewerToken}.mock.signature`,
        },
        payload: {
          site_id: mockSiteId,
          name: 'Backyard',
          stream_url: 'rtsp://192.168.1.101:554/stream',
          protocol: 'rtsp',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/cameras/discover/onvif', () => {
    it('should discover ONVIF cameras without registering them', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/cameras/discover/onvif',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          site_id: mockSiteId,
          host: '10.0.0.50',
          username: 'admin',
          password: 'secret',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.discovery.host).toBe('10.0.0.50');
      expect(body.data.connection_test.connected).toBe(true);
    });

    it('should auto-register a discovered camera when requested', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/cameras/discover/onvif',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          site_id: mockSiteId,
          host: '10.0.0.51',
          username: 'admin',
          password: 'secret',
          auto_register: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.registered_camera).toBeDefined();
      expect(body.data.registered_stream).toBeDefined();
      expect(body.data.live.endpoints.webrtc_url).toContain(body.data.registered_camera.id);
    });
  });

  describe('GET /api/cameras/:id', () => {
    it('should return camera detail', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/cameras/${mockCameraId}`,
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
        url: `/api/cameras/${mockCameraId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/cameras/:id', () => {
    it('should update camera for security-admin', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/cameras/${mockCameraId}`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          name: 'Updated Camera',
          detection_enabled: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Camera');
    });
  });

  describe('DELETE /api/cameras/:id', () => {
    it('should delete camera for security-admin', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/api/cameras/${mockCameraId}`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('POST /api/cameras/:id/test', () => {
    it('should test camera connection', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/cameras/${mockCameraId}/test`,
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('connected');
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/cameras/${mockCameraId}/test`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/cameras/test', () => {
    it('should test a manual RTSP connection', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/cameras/test',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          stream_url: 'rtsp://10.0.0.60:554/stream',
          protocol: 'rtsp',
          username: 'admin',
          password: 'secret',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.connected).toBe(true);
    });

    it('should report missing ONVIF credentials', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/cameras/test',
        headers: {
          authorization: `Bearer ${mockAuthToken}.mock.signature`,
        },
        payload: {
          stream_url: 'rtsp://10.0.0.61:554/stream',
          protocol: 'onvif',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.connected).toBe(false);
      expect(body.data.error).toContain('credentials');
    });
  });
});
