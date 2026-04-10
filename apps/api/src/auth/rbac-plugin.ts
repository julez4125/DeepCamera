import { type FastifyRequest, type FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { Permission } from '@ainvr/contracts';

// Role to Permission mapping
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  'platform-admin': [
    'read:cameras',
    'write:cameras',
    'read:incidents',
    'write:incidents',
    'read:policies',
    'write:policies',
    'read:audit_logs',
    'manage:users',
    'manage:tenant',
  ],
  'security-admin': [
    'write:cameras',
    'write:policies',
    'read:incidents',
  ],
  'operator': [
    'write:incidents',
    'read:cameras',
  ],
  'investigator': [
    'read:incidents',
    'read:policies',
  ],
  'viewer': [
    'read:cameras',
    'read:incidents',
  ],
  'integrations-admin': [
    'write:policies',
  ],
  'model-admin': [
    'write:policies',
  ],
};

// Route to Permission mapping for RBAC checks
const ROUTE_PERMISSIONS: Record<string, Record<string, Permission>> = {
  POST: {
    '/api/cameras': 'write:cameras',
    '/api/incidents/:id/ack': 'write:incidents',
    '/api/policies': 'write:policies',
  },
  GET: {
    '/api/cameras': 'read:cameras',
    '/api/incidents': 'read:incidents',
    '/api/search': 'read:incidents',
    '/api/intelligence/overview': 'read:incidents',
    '/api/ml/overview': 'read:incidents',
    '/api/policies': 'read:policies',
    '/api/audit-logs': 'read:audit_logs',
  },
  PUT: {
    '/api/cameras/:id': 'write:cameras',
    '/api/incidents/:id': 'write:incidents',
    '/api/policies/:id': 'write:policies',
  },
  DELETE: {
    '/api/cameras/:id': 'write:cameras',
    '/api/incidents/:id': 'write:incidents',
    '/api/policies/:id': 'write:policies',
  },
};

function getUserPermissions(roles: string[]): Set<Permission> {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    for (const perm of rolePerms) {
      permissions.add(perm);
    }
  }

  return permissions;
}

function getRoutePermission(method: string, path: string): Permission | null {
  const methodRoutes = ROUTE_PERMISSIONS[method];
  if (!methodRoutes) {
    return null;
  }

  // Exact match first
  if (methodRoutes[path]) {
    return methodRoutes[path];
  }

  // Try to match with path parameters
  const pathParts = path.split('/').filter((p) => p);
  for (const [routePattern, permission] of Object.entries(methodRoutes)) {
    const routeParts = routePattern.split('/').filter((p) => p);

    if (pathParts.length === routeParts.length) {
      let matches = true;
      for (let i = 0; i < pathParts.length; i++) {
        const routePart = routeParts[i];
        const pathPart = pathParts[i];

        // Exact match or parameter placeholder
        if (routePart !== pathPart && !routePart?.startsWith(':')) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return permission;
      }
    }
  }

  return null;
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new Error('Unauthorized');
    }

    const userRoles = request.user.roles || [];
    const hasRole = roles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      const error = new Error('Forbidden');
      (error as any).statusCode = 403;
      (error as any).code = 'FORBIDDEN';
      throw error;
    }
  };
}

export function requirePermission(...permissions: Permission[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new Error('Unauthorized');
    }

    const userPermissions = getUserPermissions(request.user.roles || []);
    const hasPermission = permissions.some((p) => userPermissions.has(p));

    if (!hasPermission) {
      const error = new Error('Forbidden');
      (error as any).statusCode = 403;
      (error as any).code = 'FORBIDDEN';
      throw error;
    }
  };
}

export default fp(async (fastify) => {
  // Extend FastifyRequest with user property
  fastify.decorate('getUserPermissions', (roles: string[]) => {
    return getUserPermissions(roles);
  });

  fastify.decorate('getRoutePermission', (method: string, path: string) => {
    return getRoutePermission(method, path);
  });

  // Add audit hook for denied access attempts
  fastify.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode === 403) {
      fastify.log.warn(
        {
          userId: request.user?.sub,
          method: request.method,
          path: request.url,
          roles: request.user?.roles,
        },
        'Access denied'
      );
    }
  });
}, {
  name: 'rbac-plugin',
});
