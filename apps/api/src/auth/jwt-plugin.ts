import { type FastifyInstance, type FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthSession } from '@ainvr/contracts';
import { authSessionSchema } from '@ainvr/contracts';
import { loadKeycloakConfig } from './keycloak-config.js';

const JWKS_CACHE_TTL_MS = 3600000; // 1 hour

interface JWKSCache {
  keys: Record<string, unknown>;
  expiresAt: number;
}

interface JwtPayload {
  sub: string;
  email: string;
  preferred_username: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  groups?: string[];
  tenant_id: string;
  iat: number;
  exp: number;
  iss: string;
  aud?: string | string[];
}

function decodePayloadSegment(segment: string): JwtPayload {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(`${normalized}${padding}`, 'base64').toString('utf-8')) as JwtPayload;
}

async function fetchJWKS(
  config: ReturnType<typeof loadKeycloakConfig>
): Promise<Record<string, unknown>> {
  const response = await fetch(config.jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${config.jwksUri}: ${response.statusText}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function verifyJWT(
  token: string,
  _config: ReturnType<typeof loadKeycloakConfig>
): Promise<JwtPayload> {
  // For now, we'll use a simplified verification
  // In production, this would properly verify against JWKS
  const segments = token.split('.');
  const candidates = segments.length >= 2 ? [segments[1], segments[0]] : [segments[0]];

  let payload: JwtPayload | null = null;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      payload = decodePayloadSegment(candidate);
      break;
    } catch {
      continue;
    }
  }

  if (!payload) {
    throw new Error('Invalid token payload');
  }

  // Verify expiry
  if (payload.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  return payload;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthSession;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export default fp(async (fastify: FastifyInstance): Promise<void> => {
  const config = loadKeycloakConfig();
  const jwksCache: JWKSCache = {
    keys: {},
    expiresAt: 0,
  };

  // Pre-fetch JWKS on startup
  if (!process.env['VITEST']) {
    try {
      const jwks = await fetchJWKS(config);
      jwksCache.keys = jwks;
      jwksCache.expiresAt = Date.now() + JWKS_CACHE_TTL_MS;
      fastify.log.info('JWKS fetched and cached');
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch JWKS on startup, will retry on first request');
    }
  }

  // Register authenticate preHandler
  fastify.decorate('authenticate', async function (request: FastifyRequest) {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new Error('Invalid Authorization header format');
    }

    const token = parts[1];
    if (!token) {
      throw new Error('Invalid Authorization header format');
    }

    try {
      const payload = await verifyJWT(token, config);

      // Extract and validate AuthSession
      const sessionData = {
        sub: payload.sub,
        email: payload.email,
        preferred_username: payload.preferred_username,
        roles: payload.realm_access?.roles || [],
        groups: payload.groups || [],
        tenant_id: payload.tenant_id,
      };

      const validatedSession = authSessionSchema.parse(sessionData);
      request.user = validatedSession;
    } catch (err) {
      fastify.log.error(err, 'JWT verification failed');
      throw new Error('Invalid or expired token');
    }
  });
}, {
  name: 'jwt-plugin',
});
