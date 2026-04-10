import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';

describe('Health Endpoint', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /api/health should return 200 with status ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });

  it('GET /api/health should include timestamp', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('timestamp');

    // Verify it's a valid ISO timestamp
    const timestamp = new Date(body.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('GET /api/health response should be valid JSON', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.headers['content-type']).toContain('application/json');

    // Should not throw on JSON parse
    const body = JSON.parse(response.body);
    expect(body).toBeDefined();
  });
});
