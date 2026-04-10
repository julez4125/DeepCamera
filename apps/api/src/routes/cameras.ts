import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { cameraSchema } from '@ainvr/contracts';
import type { AuditLogRepository, CameraRepository, SiteRepository, StreamRepository } from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import {
  buildCameraLiveEndpoints,
  buildCameraLiveStatus,
  buildOnvifDiscoveryCandidate,
  cameraConnectionTestSchema,
  onvifDiscoverySchema,
  testCameraConnection,
} from './camera-gateway.js';

const createCameraSchema = cameraSchema.omit({
  id: true,
  status: true,
  created_at: true,
  updated_at: true,
});

const updateCameraSchema = createCameraSchema.partial();

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.post<{
      Body: z.infer<typeof onvifDiscoverySchema>;
    }>(
      '/api/cameras/discover/onvif',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
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

        const validated = onvifDiscoverySchema.parse(request.body);
        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const streamRepo = fastify.diContainer.cradle.streamRepository as StreamRepository;
        const auditRepo = fastify.diContainer.cradle.auditLogRepository as AuditLogRepository;

        if (validated.site_id) {
          const site = await siteRepo.findById(validated.site_id);
          if (!site || site.tenant_id !== request.user.tenant_id) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Site not found',
              },
            };
          }
        }

        const candidate = buildOnvifDiscoveryCandidate(validated);
        const connectionTest = testCameraConnection({
          stream_url: candidate.recommended_stream_url,
          protocol: candidate.protocol,
          username: validated.username,
          password: validated.password,
        });

        if (validated.auto_register && !validated.site_id) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'site_id is required when auto_register is enabled',
            },
          };
        }

        let registeredCamera = null;
        let registeredStream = null;

        if (validated.auto_register) {
          if (!connectionTest.connected) {
            reply.code(422);
            return {
              success: false,
              error: {
                code: 'UNPROCESSABLE_ENTITY',
                message: 'Valid credentials are required before auto registration',
              },
              data: {
                discovery: candidate,
                connection_test: connectionTest,
              },
            };
          }

          registeredCamera = await cameraRepo.create({
            site_id: validated.site_id,
            name: candidate.camera_name,
            stream_url: candidate.recommended_stream_url,
            protocol: candidate.protocol,
            status: 'online',
            detection_enabled: true,
            recording_enabled: true,
          });

          registeredStream = await streamRepo.create({
            camera_id: registeredCamera.id,
            stream_type: 'main',
            url: candidate.recommended_stream_url,
            active: true,
          });

          await auditRepo.log(
            request.user.tenant_id,
            request.user.sub,
            'CREATE',
            'camera',
            registeredCamera.id,
            {
              source: 'onvif-discovery',
              name: registeredCamera.name,
              stream_url: registeredCamera.stream_url,
            },
            request.ip || undefined
          );
        }

        return {
          success: true,
          data: {
            discovery: candidate,
            connection_test: connectionTest,
            registered_camera: registeredCamera,
            registered_stream: registeredStream,
            live: registeredCamera
              ? {
                  status: buildCameraLiveStatus(registeredCamera, 1, false),
                  endpoints: buildCameraLiveEndpoints(registeredCamera.id),
                }
              : null,
          },
        };
      }
    );

    // GET /api/cameras - List cameras (filter by site_id)
    fastify.get<{
      Querystring: {
        site_id?: string;
        page?: string;
        pageSize?: string;
      };
    }>(
      '/api/cameras',
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

        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const page = parseInt(request.query.page || '1', 10);
        const pageSize = parseInt(request.query.pageSize || '20', 10);
        const offset = (page - 1) * pageSize;

        let result;

        if (request.query.site_id) {
          result = await cameraRepo.findBySiteId(request.query.site_id, {
            limit: pageSize,
            offset,
          });
        } else {
          result = await cameraRepo.findAll({}, { limit: pageSize, offset });
        }

        return {
          success: true,
          data: {
            data: result.data,
            page,
            pageSize,
            total: result.total,
            hasMore: offset + pageSize < result.total,
          },
        };
      }
    );

    // POST /api/cameras - Create camera
    fastify.post<{
      Body: z.infer<typeof createCameraSchema>;
    }>(
      '/api/cameras',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
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

        const validated = createCameraSchema.parse(request.body);
        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const streamRepo = fastify.diContainer.cradle.streamRepository as StreamRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        // Verify site exists and belongs to tenant
        const site = await siteRepo.findById(validated.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Site not found',
            },
          };
        }

        const camera = await cameraRepo.create({
          site_id: validated.site_id,
          name: validated.name,
          stream_url: validated.stream_url,
          protocol: validated.protocol,
          detection_enabled: validated.detection_enabled ?? true,
          recording_enabled: validated.recording_enabled ?? true,
          status: 'unknown',
        });
        await streamRepo.create({
          camera_id: camera.id,
          stream_type: 'main',
          url: camera.stream_url,
          active: camera.status === 'online',
        });

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'CREATE',
          'camera',
          camera.id,
          {
            name: camera.name,
            site_id: camera.site_id,
          },
          request.ip || undefined
        );

        reply.code(201);
        return {
          success: true,
          data: {
            ...camera,
            live: {
              status: buildCameraLiveStatus(camera, 1, false),
              endpoints: buildCameraLiveEndpoints(camera.id),
            },
          },
        };
      }
    );

    // GET /api/cameras/:id - Get camera detail
    fastify.get<{
      Params: { id: string };
    }>(
      '/api/cameras/:id',
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

        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;

        const camera = await cameraRepo.findById(request.params.id);
        if (!camera) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Camera not found',
            },
          };
        }

        // Verify site belongs to tenant
        const site = await siteRepo.findById(camera.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        return {
          success: true,
          data: camera,
        };
      }
    );

    // PATCH /api/cameras/:id - Update camera
    fastify.patch<{
      Params: { id: string };
      Body: z.infer<typeof updateCameraSchema>;
    }>(
      '/api/cameras/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
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

        const validated = updateCameraSchema.parse(request.body);
        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingCamera = await cameraRepo.findById(request.params.id);
        if (!existingCamera) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Camera not found',
            },
          };
        }

        // Verify site belongs to tenant
        const site = await siteRepo.findById(existingCamera.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const updated = await cameraRepo.update(request.params.id, validated);

        // Log audit event
        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'UPDATE',
          'camera',
          request.params.id,
          validated,
          request.ip || undefined
        );

        return {
          success: true,
          data: updated,
        };
      }
    );

    // DELETE /api/cameras/:id - Delete camera
    fastify.delete<{
      Params: { id: string };
    }>(
      '/api/cameras/:id',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
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

        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const existingCamera = await cameraRepo.findById(request.params.id);
        if (!existingCamera) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Camera not found',
            },
          };
        }

        // Verify site belongs to tenant
        const site = await siteRepo.findById(existingCamera.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const deleted = await cameraRepo.delete(request.params.id);

        if (deleted) {
          // Log audit event
          await auditRepo.log(
            request.user.tenant_id,
            request.user.sub,
            'DELETE',
            'camera',
            request.params.id,
            { name: existingCamera.name },
            request.ip || undefined
          );
        }

        reply.code(204);
        return;
      }
    );

    // POST /api/cameras/:id/test - Test camera connection
    fastify.post<{
      Params: { id: string };
    }>(
      '/api/cameras/:id/test',
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

        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        const camera = await cameraRepo.findById(request.params.id);
        if (!camera) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Camera not found',
            },
          };
        }

        // Verify site belongs to tenant
        const site = await siteRepo.findById(camera.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
            },
          };
        }

        const testResult = testCameraConnection({
          stream_url: camera.stream_url,
          protocol: camera.protocol,
        });

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'TEST_CONNECTION',
          'camera',
          camera.id,
          { ...testResult },
          request.ip || undefined
        );

        return {
          success: true,
          data: testResult,
        };
      }
    );

    fastify.post<{
      Body: z.infer<typeof cameraConnectionTestSchema>;
    }>(
      '/api/cameras/test',
      { preHandler: [fastify.authenticate, requireRole('security-admin', 'platform-admin')] },
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

        const validated = cameraConnectionTestSchema.parse(request.body);
        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const auditRepo = fastify.diContainer.cradle
          .auditLogRepository as AuditLogRepository;

        if (validated.camera_id) {
          const camera = await cameraRepo.findById(validated.camera_id);
          if (!camera) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Camera not found',
              },
            };
          }

          const site = await siteRepo.findById(camera.site_id);
          if (!site || site.tenant_id !== request.user.tenant_id) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Access denied',
              },
            };
          }

          const testResult = testCameraConnection({
            stream_url: validated.stream_url ?? camera.stream_url,
            protocol: validated.protocol ?? camera.protocol,
            username: validated.username,
            password: validated.password,
          });

          await auditRepo.log(
            request.user.tenant_id,
            request.user.sub,
            'TEST_CONNECTION',
            'camera',
            camera.id,
            { ...testResult },
            request.ip || undefined
          );

          return {
            success: true,
            data: {
              camera_id: camera.id,
              ...testResult,
            },
          };
        }

        if (!validated.stream_url) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'stream_url is required when camera_id is not provided',
            },
          };
        }

        const testResult = testCameraConnection({
          stream_url: validated.stream_url,
          protocol: validated.protocol ?? 'rtsp',
          username: validated.username,
          password: validated.password,
        });

        await auditRepo.log(
          request.user.tenant_id,
          request.user.sub,
          'TEST_CONNECTION',
          'camera',
          validated.camera_name ?? undefined,
          { ...testResult },
          request.ip || undefined
        );

        return {
          success: true,
          data: {
            ...testResult,
            camera_name: validated.camera_name ?? null,
            stream_url: validated.stream_url ?? null,
          },
        };
      }
    );
  },
  {
    name: 'cameras-routes',
  }
);
