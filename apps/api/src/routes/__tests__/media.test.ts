import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../server.js';

describe('Media Routes', () => {
  let server: FastifyInstance;
  const mockCameraId = '550e8400-e29b-41d4-a716-446655440000';
  const mockRecordingId = '550e8400-e29b-41d4-a716-446655440801';
  const mockClipId = '550e8400-e29b-41d4-a716-446655440901';
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440002';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440903';

  const mockAuthToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'media@example.com',
      preferred_username: 'media-user',
      realm_access: { roles: ['viewer'] },
      groups: [],
      tenant_id: mockTenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'http://localhost:8080/auth/realms/ain-vr',
    })
  ).toString('base64');

  const mockOperatorToken = Buffer.from(
    JSON.stringify({
      sub: mockUserId,
      email: 'operator@example.com',
      preferred_username: 'media-operator',
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

  it('returns live endpoint metadata for a camera', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/live`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.endpoints.webrtc_url).toContain(mockCameraId);
    expect(body.data.endpoints.hls_url).toContain(mockCameraId);
  });

  it('returns live status and endpoint resolution separately', async () => {
    const statusResponse = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/live/status`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(statusResponse.statusCode).toBe(200);
    const statusBody = JSON.parse(statusResponse.body);
    expect(statusBody.success).toBe(true);
    expect(statusBody.data.status.online).toBe(true);
    expect(statusBody.data.status.provider).toBe('go2rtc');

    const endpointsResponse = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/live/endpoints`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(endpointsResponse.statusCode).toBe(200);
    const endpointsBody = JSON.parse(endpointsResponse.body);
    expect(endpointsBody.success).toBe(true);
    expect(endpointsBody.data.endpoints.webrtc_url).toContain(mockCameraId);
    expect(endpointsBody.data.endpoints.hls_url).toContain(mockCameraId);
  });

  it('returns gateway-style playback metadata', async () => {
    const webrtcResponse = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/live/webrtc`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(webrtcResponse.statusCode).toBe(200);
    const webrtcBody = JSON.parse(webrtcResponse.body);
    expect(webrtcBody.success).toBe(true);
    expect(webrtcBody.data.playback).toBe('webrtc');
    expect(webrtcBody.data.go2rtc_stream).toContain(mockCameraId);

    const hlsResponse = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/live/hls`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(hlsResponse.statusCode).toBe(200);
    const hlsBody = JSON.parse(hlsResponse.body);
    expect(hlsBody.success).toBe(true);
    expect(hlsBody.data.playback).toBe('hls');
    expect(hlsBody.data.manifest_url).toContain('index.m3u8');
  });

  it('captures and returns the latest snapshot for a camera', async () => {
    const createResponse = await server.inject({
      method: 'POST',
      url: `/api/cameras/${mockCameraId}/snapshots`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(createResponse.statusCode).toBe(201);

    const latestResponse = await server.inject({
      method: 'GET',
      url: `/api/cameras/${mockCameraId}/snapshots/latest`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(latestResponse.statusCode).toBe(200);
    const latestBody = JSON.parse(latestResponse.body);
    expect(latestBody.success).toBe(true);
    expect(latestBody.data.camera_id).toBe(mockCameraId);
  });

  it('streams and downloads historical recordings', async () => {
    const playbackResponse = await server.inject({
      method: 'GET',
      url: `/api/media/recordings/${mockRecordingId}/playback`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(playbackResponse.statusCode).toBe(200);
    expect(playbackResponse.headers['content-type']).toContain('video/mp4');
    expect(playbackResponse.headers['content-disposition']).toContain('inline;');

    const downloadResponse = await server.inject({
      method: 'GET',
      url: `/api/media/recordings/${mockRecordingId}/download`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers['content-disposition']).toContain('attachment;');
  });

  it('streams and downloads extracted clips', async () => {
    const playbackResponse = await server.inject({
      method: 'GET',
      url: `/api/media/clips/${mockClipId}/playback`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(playbackResponse.statusCode).toBe(200);
    expect(playbackResponse.headers['content-type']).toContain('video/mp4');
    expect(playbackResponse.headers['content-disposition']).toContain('inline;');

    const downloadResponse = await server.inject({
      method: 'GET',
      url: `/api/media/clips/${mockClipId}/download`,
      headers: {
        authorization: `Bearer ${mockAuthToken}.mock.signature`,
      },
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers['content-disposition']).toContain('attachment;');
  });

  it('finalizes a clip and schedules policy-driven replication', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/cameras/${mockCameraId}/clips/finalize`,
      headers: {
        authorization: `Bearer ${mockOperatorToken}.mock.signature`,
      },
      payload: {
        start_time: '2024-01-01T10:01:00.000Z',
        end_time: '2024-01-01T10:02:00.000Z',
        replicate: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.file_path).toContain('/clips/');
    expect(body.data.thumbnail_path).toContain('.jpg');
    expect(body.data.manifest_path).toContain('.manifest.json');
    expect(body.data.metadata.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(body.data.metadata.status).toBe('replicating');
    expect(body.data.playback.playback_url).toContain(`/api/media/clips/${body.data.id}/playback`);
    expect(body.data.playback.download_url).toContain(`/api/media/clips/${body.data.id}/download`);
    expect(body.data.replicas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'replicated' }),
        expect.objectContaining({ status: 'replicating' }),
      ])
    );
  });
});
