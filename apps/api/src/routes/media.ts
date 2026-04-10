import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { type FastifyInstance, type FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type {
  Camera,
  CameraRepository,
  ClipRepository,
  Recording,
  RecordingRepository,
  SiteRepository,
  SnapshotRepository,
  StoragePolicyAssignment,
  StorageObjectCopyRepository,
  StoragePolicyAssignmentRepository,
  StorageReplicationJobRepository,
  StorageTarget,
  StorageTargetRepository,
  StreamRepository,
} from '../db/repositories/index.js';
import { requireRole } from '../auth/index.js';
import {
  buildReplicationDestinationPrefix,
  finalizeClipArtifacts,
  replicateClipArtifactsToMountedTarget,
} from '../media/clip-finalizer.js';
import type { CameraLiveEndpoints } from './camera-gateway.js';
import { buildCameraLiveEndpoints, buildCameraLiveStatus } from './camera-gateway.js';

const snapshotQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
});

const finalizeClipSchema = z
  .object({
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    recording_ids: z.array(z.string().uuid()).optional(),
    replicate: z.boolean().optional().default(true),
  })
  .refine((value) => Date.parse(value.end_time) > Date.parse(value.start_time), {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  });

function buildLiveEndpoints(cameraId: string): CameraLiveEndpoints {
  return buildCameraLiveEndpoints(cameraId);
}

function mediaContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.mkv':
      return 'video/x-matroska';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

async function verifyCameraAccess(
  fastify: FastifyInstance,
  userTenantId: string,
  cameraId: string
): Promise<{ ok: true } | { ok: false; code: 403 | 404; message: string }> {
  const scope = await loadCameraScope(fastify, userTenantId, cameraId);
  if (!scope.ok) {
    return scope;
  }

  return { ok: true };
}

async function loadCameraScope(
  fastify: FastifyInstance,
  userTenantId: string,
  cameraId: string
): Promise<
  | { ok: true; camera: Camera; site: { id: string; tenant_id: string } }
  | { ok: false; code: 403 | 404; message: string }
> {
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

  return { ok: true, camera, site };
}

function overlapsRecording(recording: Recording, startTime: string, endTime: string): boolean {
  const requestedStart = Date.parse(startTime);
  const requestedEnd = Date.parse(endTime);
  const recordingStart = Date.parse(recording.start_time);
  const recordingEnd = Date.parse(recording.end_time || recording.start_time);

  return recordingStart <= requestedEnd && recordingEnd >= requestedStart;
}

async function resolveReplicationPlans(
  fastify: FastifyInstance,
  tenantId: string,
  camera: Camera
): Promise<
  Array<{
    assignment: StoragePolicyAssignment;
    target: StorageTarget;
  }>
> {
  const assignmentRepo =
    fastify.diContainer.cradle.storagePolicyAssignmentRepository as StoragePolicyAssignmentRepository;
  const targetRepo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;

  const [cameraAssignments, siteAssignments] = await Promise.all([
    assignmentRepo.findByCameraId(camera.id),
    assignmentRepo.findBySiteId(camera.site_id),
  ]);

  const merged = [...cameraAssignments, ...siteAssignments]
    .filter((assignment) => assignment.tenant_id === tenantId && assignment.replication_enabled)
    .sort((left, right) => {
      const leftPriority = left.camera_id === camera.id ? 0 : 1;
      const rightPriority = right.camera_id === camera.id ? 0 : 1;
      return leftPriority - rightPriority || left.priority - right.priority;
    });

  const chosen = new Map<string, (typeof merged)[number]>();
  for (const assignment of merged) {
    if (!chosen.has(assignment.storage_target_id)) {
      chosen.set(assignment.storage_target_id, assignment);
    }
  }

  const plans = await Promise.all(
    Array.from(chosen.values()).map(async (assignment) => {
      const target = await targetRepo.findById(assignment.storage_target_id);
      if (!target) {
        return null;
      }

      return {
        assignment,
        target,
      };
    })
  );

  return plans.filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
}

function sendMediaFile(
  reply: FastifyReply,
  filePath: string,
  asAttachment: boolean
): FastifyReply {
  reply.header('content-type', mediaContentType(filePath));
  reply.header(
    'content-disposition',
    `${asAttachment ? 'attachment' : 'inline'}; filename="${basename(filePath)}"`
  );
  return reply.send(createReadStream(filePath));
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.get<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/live',
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
      const snapshotRepo = fastify.diContainer.cradle.snapshotRepository as SnapshotRepository;

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

      const streamResult = await streamRepo.findByCameraId(camera.id, { limit: 10, offset: 0 });
      const latestSnapshot = await snapshotRepo.findLatestByCameraId(camera.id);
      const endpoints = buildLiveEndpoints(camera.id);
      const status = buildCameraLiveStatus(camera, streamResult.total, Boolean(latestSnapshot));

      return {
        success: true,
        data: {
          camera_id: camera.id,
          status: camera.status,
          connection: status,
          endpoints,
          streams: streamResult.data,
          latest_snapshot: latestSnapshot,
        },
      };
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: z.infer<typeof finalizeClipSchema>;
  }>(
    '/api/cameras/:id/clips/finalize',
    {
      preHandler: [
        fastify.authenticate,
        requireRole('operator', 'investigator', 'security-admin', 'platform-admin'),
      ],
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const scope = await loadCameraScope(fastify, request.user.tenant_id, request.params.id);
      if (!scope.ok) {
        reply.code(scope.code);
        return {
          success: false,
          error: { code: scope.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: scope.message },
        };
      }

      const validated = finalizeClipSchema.parse(request.body);
      const recordingRepo = fastify.diContainer.cradle.recordingRepository as RecordingRepository;
      const clipRepo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const objectCopyRepo =
        fastify.diContainer.cradle.storageObjectCopyRepository as StorageObjectCopyRepository;
      const replicationRepo =
        fastify.diContainer.cradle.storageReplicationJobRepository as StorageReplicationJobRepository;
      const targetRepo = fastify.diContainer.cradle.storageTargetRepository as StorageTargetRepository;

      const recordingWindow = await recordingRepo.findByCameraId(scope.camera.id, {
        limit: 200,
        offset: 0,
      });
      const candidateRecordings = recordingWindow.data
        .filter((recording) => overlapsRecording(recording, validated.start_time, validated.end_time))
        .filter((recording) =>
          validated.recording_ids?.length ? validated.recording_ids.includes(recording.id) : true
        )
        .filter((recording) => Boolean(recording.file_path) && existsSync(recording.file_path!));

      if (candidateRecordings.length === 0) {
        reply.code(422);
        return {
          success: false,
          error: {
            code: 'NO_RECORDINGS',
            message: 'No local recordings overlap the requested clip range',
          },
        };
      }

      const artifacts = await finalizeClipArtifacts({
        cameraId: scope.camera.id,
        tenantId: request.user.tenant_id,
        startTime: validated.start_time,
        endTime: validated.end_time,
        recordings: candidateRecordings,
      });

      const copyResults: Array<{ target_id: string; status: string; object_path: string }> = [];
      let overallStatus: 'local_only' | 'replicating' | 'replicated' | 'degraded' = 'local_only';

      if (validated.replicate) {
        const plans = await resolveReplicationPlans(fastify, request.user.tenant_id, scope.camera);

        for (const plan of plans) {
          const destinationPrefix = buildReplicationDestinationPrefix(
            plan.assignment,
            scope.camera.id,
            artifacts.clipId
          );

          if (
            plan.target.target_type === 'local' ||
            plan.target.target_type === 'smb' ||
            plan.target.target_type === 'nfs'
          ) {
            try {
              const replicated = await replicateClipArtifactsToMountedTarget({
                target: plan.target,
                destinationPrefix,
                clipFilePath: artifacts.filePath,
                thumbnailPath: artifacts.thumbnailPath,
                manifestPath: artifacts.manifestPath,
              });

              await objectCopyRepo.create({
                tenant_id: request.user.tenant_id,
                clip_id: artifacts.clipId,
                recording_id: null,
                storage_target_id: plan.target.id,
                object_path: replicated.objectPath,
                copy_status: 'replicated',
                checksum: replicated.checksum,
                size_bytes: replicated.sizeBytes,
                verified_at: new Date().toISOString(),
              });

              await targetRepo.updateStatus(plan.target.id, 'healthy', null);
              copyResults.push({
                target_id: plan.target.id,
                status: 'replicated',
                object_path: replicated.objectPath,
              });
              overallStatus = overallStatus === 'replicating' ? 'replicating' : 'replicated';
            } catch (error) {
              await targetRepo.updateStatus(plan.target.id, 'degraded', (error as Error).message);
              await objectCopyRepo.create({
                tenant_id: request.user.tenant_id,
                clip_id: artifacts.clipId,
                recording_id: null,
                storage_target_id: plan.target.id,
                object_path: destinationPrefix,
                copy_status: 'degraded',
                checksum: artifacts.checksum,
                size_bytes: artifacts.fileSize,
                verified_at: null,
              });
              copyResults.push({
                target_id: plan.target.id,
                status: 'degraded',
                object_path: destinationPrefix,
              });
              overallStatus = 'degraded';
            }
            continue;
          }

          if (plan.target.target_type === 's3') {
            const objectCopy = await objectCopyRepo.create({
              tenant_id: request.user.tenant_id,
              clip_id: artifacts.clipId,
              recording_id: null,
              storage_target_id: plan.target.id,
              object_path: `${destinationPrefix}/${basename(artifacts.filePath)}`,
              copy_status: 'replicating',
              checksum: artifacts.checksum,
              size_bytes: artifacts.fileSize,
              verified_at: null,
            });

            await replicationRepo.create({
              tenant_id: request.user.tenant_id,
              storage_target_id: plan.target.id,
              object_copy_id: objectCopy.id,
              source_path: artifacts.filePath,
              destination_path: objectCopy.object_path,
              status: 'pending',
              attempts: 0,
              bytes_total: artifacts.fileSize,
              bytes_transferred: 0,
              last_error: null,
            });

            copyResults.push({
              target_id: plan.target.id,
              status: 'replicating',
              object_path: objectCopy.object_path,
            });
            if (overallStatus !== 'degraded') {
              overallStatus = 'replicating';
            }
          }
        }
      }

      const clip = await clipRepo.create({
        id: artifacts.clipId,
        camera_id: scope.camera.id,
        recording_id: candidateRecordings[0]?.id ?? null,
        start_time: validated.start_time,
        end_time: validated.end_time,
        file_path: artifacts.filePath,
        file_size: artifacts.fileSize,
        thumbnail_path: artifacts.thumbnailPath,
        metadata: {
          ...artifacts.metadata,
          status: overallStatus,
          replica_targets: copyResults,
        },
      });

      reply.code(201);
      return {
        success: true,
        data: {
          ...clip,
          manifest_path: artifacts.manifestPath,
          playback: {
            preview_url: clip.thumbnail_path,
            playback_url: `/api/media/clips/${clip.id}/playback`,
            download_url: `/api/media/clips/${clip.id}/download`,
            storage_status: overallStatus,
          },
          replicas: copyResults,
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/live/status',
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
      const snapshotRepo = fastify.diContainer.cradle.snapshotRepository as SnapshotRepository;

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

      const streamResult = await streamRepo.findByCameraId(camera.id, { limit: 10, offset: 0 });
      const latestSnapshot = await snapshotRepo.findLatestByCameraId(camera.id);

      return {
        success: true,
        data: {
          camera_id: camera.id,
          status: buildCameraLiveStatus(camera, streamResult.total, Boolean(latestSnapshot)),
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/live/endpoints',
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

      return {
        success: true,
        data: {
          camera_id: camera.id,
          endpoints: buildLiveEndpoints(camera.id),
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/live/webrtc',
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

      const endpoints = buildLiveEndpoints(camera.id);
      return {
        success: true,
        data: {
          camera_id: camera.id,
          go2rtc_stream: endpoints.go2rtc_stream,
          playback: 'webrtc',
          transport: camera.protocol === 'rtsp' || camera.protocol === 'onvif' ? 'proxied' : 'direct',
          upstream_url: camera.stream_url,
          url: endpoints.webrtc_url,
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/live/hls',
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

      const endpoints = buildLiveEndpoints(camera.id);
      return {
        success: true,
        data: {
          camera_id: camera.id,
          go2rtc_stream: endpoints.go2rtc_stream,
          manifest_url: `${endpoints.hls_url}/index.m3u8`,
          playback: 'hls',
          upstream_url: camera.stream_url,
          url: endpoints.hls_url,
        },
      };
    }
  );

  fastify.get<{
    Params: { id: string };
    Querystring: z.infer<typeof snapshotQuerySchema>;
  }>(
    '/api/cameras/:id/snapshots',
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
      const snapshotRepo = fastify.diContainer.cradle.snapshotRepository as SnapshotRepository;
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

      const query = snapshotQuerySchema.parse(request.query);
      const page = parseInt(query.page, 10);
      const pageSize = parseInt(query.pageSize, 10);
      const offset = (page - 1) * pageSize;
      const result = await snapshotRepo.findByCameraId(camera.id, { limit: pageSize, offset });

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

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/snapshots/latest',
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
      const snapshotRepo = fastify.diContainer.cradle.snapshotRepository as SnapshotRepository;

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

      const snapshot = await snapshotRepo.findLatestByCameraId(camera.id);
      if (!snapshot) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Snapshot not found' },
        };
      }

      return {
        success: true,
        data: snapshot,
      };
    }
  );

  fastify.post<{
    Params: { id: string };
  }>(
    '/api/cameras/:id/snapshots',
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
      const snapshotRepo = fastify.diContainer.cradle.snapshotRepository as SnapshotRepository;

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

      const now = new Date().toISOString();
      const snapshot = await snapshotRepo.create({
        id: randomUUID(),
        camera_id: camera.id,
        recording_id: null,
        clip_id: null,
        storage_path: `/var/lib/ainvr/snapshots/${camera.id}/${Date.now()}.jpg`,
        mime_type: 'image/jpeg',
        width: 1920,
        height: 1080,
        checksum: null,
        captured_at: now,
        source: 'stream',
        metadata: {
          generated_from: camera.stream_url,
          fallback: camera.status !== 'online',
        },
      });

      reply.code(201);
      return {
        success: true,
        data: snapshot,
      };
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/media/recordings/:id/playback',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const recordingRepo = fastify.diContainer.cradle.recordingRepository as RecordingRepository;
      const recording = await recordingRepo.findById(request.params.id);
      if (!recording) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Recording not found' },
        };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, recording.camera_id);
      if (!access.ok) {
        reply.code(access.code);
        return {
          success: false,
          error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message },
        };
      }

      if (!recording.file_path || !existsSync(recording.file_path)) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Recording file not found' },
        };
      }

      return sendMediaFile(reply, recording.file_path, false);
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/media/recordings/:id/download',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const recordingRepo = fastify.diContainer.cradle.recordingRepository as RecordingRepository;
      const recording = await recordingRepo.findById(request.params.id);
      if (!recording) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Recording not found' },
        };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, recording.camera_id);
      if (!access.ok) {
        reply.code(access.code);
        return {
          success: false,
          error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message },
        };
      }

      if (!recording.file_path || !existsSync(recording.file_path)) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Recording file not found' },
        };
      }

      return sendMediaFile(reply, recording.file_path, true);
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/media/clips/:id/playback',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const clipRepo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const clip = await clipRepo.findById(request.params.id);
      if (!clip) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Clip not found' },
        };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, clip.camera_id);
      if (!access.ok) {
        reply.code(access.code);
        return {
          success: false,
          error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message },
        };
      }

      if (!existsSync(clip.file_path)) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Clip file not found' },
        };
      }

      return sendMediaFile(reply, clip.file_path, false);
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/api/media/clips/:id/download',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        };
      }

      const clipRepo = fastify.diContainer.cradle.clipRepository as ClipRepository;
      const clip = await clipRepo.findById(request.params.id);
      if (!clip) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Clip not found' },
        };
      }

      const access = await verifyCameraAccess(fastify, request.user.tenant_id, clip.camera_id);
      if (!access.ok) {
        reply.code(access.code);
        return {
          success: false,
          error: { code: access.code === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: access.message },
        };
      }

      if (!existsSync(clip.file_path)) {
        reply.code(404);
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Clip file not found' },
        };
      }

      return sendMediaFile(reply, clip.file_path, true);
    }
  );
});
