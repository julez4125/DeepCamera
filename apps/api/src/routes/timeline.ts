import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  CameraRepository,
  Clip,
  ClipRepository,
  Recording,
  RecordingRepository,
  SiteRepository,
} from '../db/repositories/index.js';

const paginationSchema = z.object({
  camera_id: z.string().uuid(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
});

function toPlaybackData(clip: Clip): Record<string, unknown> {
  return {
    preview_url: clip.thumbnail_path,
    playback_url: `/api/media/clips/${clip.id}/playback`,
    download_url: `/api/media/clips/${clip.id}/download`,
    storage_status: clip.metadata['status'] ?? 'local_only',
  };
}

function toRecordingPlaybackData(recording: Recording): Record<string, unknown> {
  return {
    preview_url: null,
    playback_url: `/api/media/recordings/${recording.id}/playback`,
    download_url: `/api/media/recordings/${recording.id}/download`,
    storage_status: recording.file_path ? 'local_only' : 'missing',
  };
}

async function verifyCameraAccess(
  fastify: FastifyInstance,
  userTenantId: string,
  cameraId: string
): Promise<{ ok: true } | { ok: false; code: 403 | 404; message: string }> {
  const cameraRepo = fastify.diContainer.cradle.cameraRepository as CameraRepository;
  const siteRepo = fastify.diContainer.cradle.siteRepository as SiteRepository;

  const camera = await cameraRepo.findById(cameraId);
  if (!camera) {
    return { ok: false, code: 404, message: 'Camera not found' };
  }

  const site = await siteRepo.findById(camera.site_id);
  if (!site || site.tenant_id !== userTenantId) {
    return { ok: false, code: 403, message: 'Access denied' };
  }

  return { ok: true };
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Params: { id: string };
    Querystring: { page?: string; pageSize?: string; date_from?: string; date_to?: string };
  }>(
    '/api/cameras/:id/recordings',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, request.params.id);
      if (!access.ok) {
        reply.code(access.code);
        return { success: false, error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message } };
      }

      const repo = fastify.diContainer.cradle.recordingRepository as RecordingRepository;
      const page = parseInt(request.query.page || '1', 10);
      const pageSize = parseInt(request.query.pageSize || '20', 10);
      const offset = (page - 1) * pageSize;
      const result = await repo.findByCameraId(
        request.params.id,
        { limit: pageSize, offset },
        {
          start_from: request.query.date_from,
          start_to: request.query.date_to,
        }
      );

      return {
        success: true,
        data: {
          data: result.data.map((recording) => ({
            ...recording,
            playback: toRecordingPlaybackData(recording),
          })),
          page,
          pageSize,
          total: result.total,
          hasMore: offset + pageSize < result.total,
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
    Querystring: { page?: string; pageSize?: string; date_from?: string; date_to?: string };
  }>(
    '/api/cameras/:id/clips',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, request.params.id);
      if (!access.ok) {
        reply.code(access.code);
        return { success: false, error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message } };
      }

      const repo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const page = parseInt(request.query.page || '1', 10);
      const pageSize = parseInt(request.query.pageSize || '20', 10);
      const offset = (page - 1) * pageSize;
      const result = await repo.findByCameraId(
        request.params.id,
        { limit: pageSize, offset },
        {
          start_from: request.query.date_from,
          start_to: request.query.date_to,
        }
      );

      return {
        success: true,
        data: {
          data: result.data.map((clip) => ({
            ...clip,
            playback: toPlaybackData(clip),
          })),
          page,
          pageSize,
          total: result.total,
          hasMore: offset + pageSize < result.total,
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/clips/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const repo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const clip = await repo.findById(request.params.id);
      if (!clip) {
        reply.code(404);
        return { success: false, error: { code: 'NOT_FOUND', message: 'Clip not found' } };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, clip.camera_id);
      if (!access.ok) {
        reply.code(access.code);
        return { success: false, error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message } };
      }

      return {
        success: true,
        data: {
          ...clip,
          playback: toPlaybackData(clip),
        },
      };
    }
  );

  fastify.get<{
    Querystring: z.infer<typeof paginationSchema>;
  }>(
    '/api/timeline',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
      }

      const query = paginationSchema.parse(request.query);
      const access = await verifyCameraAccess(fastify, request.user.tenant_id, query.camera_id);
      if (!access.ok) {
        reply.code(access.code);
        return { success: false, error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message } };
      }

      const repo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const recordingRepo = fastify.diContainer.cradle.recordingRepository as RecordingRepository;
      const page = parseInt(query.page, 10);
      const pageSize = parseInt(query.pageSize, 10);
      const resultWindow = Math.max(pageSize * 5, 100);
      const clipResult = await repo.findByCameraId(
        query.camera_id,
        { limit: resultWindow, offset: 0 },
        {
          start_from: query.date_from,
          start_to: query.date_to,
        }
      );
      const recordingResult = await recordingRepo.findByCameraId(
        query.camera_id,
        { limit: resultWindow, offset: 0 },
        {
          start_from: query.date_from,
          start_to: query.date_to,
        }
      );

      const mergedItems = [
        ...clipResult.data.map((clip) => ({
          id: clip.id,
          type: 'clip',
          start_time: clip.start_time,
          end_time: clip.end_time,
          thumbnail_path: clip.thumbnail_path,
          playback: toPlaybackData(clip),
          metadata: clip.metadata,
        })),
        ...recordingResult.data.map((recording) => ({
          id: recording.id,
          type: 'recording',
          start_time: recording.start_time,
          end_time: recording.end_time,
          thumbnail_path: null,
          playback: toRecordingPlaybackData(recording),
          metadata: {
            file_size: recording.file_size,
            recording_mode: recording.recording_mode,
          },
        })),
      ].sort((left, right) => right.start_time.localeCompare(left.start_time));
      const offset = (page - 1) * pageSize;
      const items = mergedItems.slice(offset, offset + pageSize);

      return {
        success: true,
        data: {
          camera_id: query.camera_id,
          items,
          page,
          pageSize,
          total: mergedItems.length,
          hasMore: offset + pageSize < mergedItems.length,
        },
      };
    }
  );
});
