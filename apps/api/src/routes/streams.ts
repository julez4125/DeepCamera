import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type {
  CameraRepository,
  SiteRepository,
  StreamRepository,
} from '../db/repositories/index.js';

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.get<{
      Params: { id: string };
    }>(
      '/api/cameras/:id/streams',
      { preHandler: [fastify.authenticate] },
      async (request, reply) => {
        if (!request.user) {
          reply.code(401);
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          };
        }

        const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
        const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;
        const streamRepo = fastify.diContainer.cradle.streamRepository as StreamRepository;

        const camera = await cameraRepo.findById(request.params.id);
        if (!camera) {
          reply.code(404);
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Camera not found' },
          };
        }

        const site = await siteRepo.findById(camera.site_id);
        if (!site || site.tenant_id !== request.user.tenant_id) {
          reply.code(403);
          return {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          };
        }

        const result = await streamRepo.findByCameraId(request.params.id, {
          limit: 10,
          offset: 0,
        });

        const streams = result.data.length
          ? result.data
          : [
              {
                id: `derived-${camera.id}`,
                camera_id: camera.id,
                stream_type: 'main' as const,
                url: camera.stream_url,
                active: camera.status === 'online',
                created_at: camera.created_at,
              },
            ];

        return {
          success: true,
          data: {
            camera_id: camera.id,
            status: camera.status,
            streams: streams.map((stream) => ({
              ...stream,
              metadata: {
                protocol: camera.protocol,
                codec: 'h264',
                resolution: '1920x1080',
                fps: 25,
              },
            })),
          },
        };
      }
    );
  },
  {
    name: 'streams-routes',
  }
);
