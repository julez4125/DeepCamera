import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Permission, AuthSession } from '@ainvr/contracts';

export default fp(
  async (fastify: FastifyInstance) => {
    // GET /api/auth/me - Get current user session info
    fastify.get(
      '/api/auth/me',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        const session: AuthSession = request.user;

        return {
          success: true,
          data: {
            sub: session.sub,
            email: session.email,
            preferred_username: session.preferred_username,
            roles: session.roles,
            groups: session.groups,
            tenant_id: session.tenant_id,
          },
        };
      }
    );

    // GET /api/auth/permissions - Get resolved permissions for current user
    fastify.get(
      '/api/auth/permissions',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          };
        }

        // Get permissions from RBAC plugin
        const permissions = fastify.getUserPermissions(request.user.roles || []);
        const permissionList = Array.from(permissions) as Permission[];

        return {
          success: true,
          data: {
            roles: request.user.roles,
            permissions: permissionList,
          },
        };
      }
    );
  },
  {
    name: 'auth-routes',
  }
);
