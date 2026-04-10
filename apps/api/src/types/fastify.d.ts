import 'fastify';
import type { AuthSession, Permission } from '@ainvr/contracts';
import type {
  AuditLogRepository,
  AlertRouteRepository,
  CameraRepository,
  ClipRepository,
  EnrichmentRepository,
  EventRepository,
  IncidentRepository,
  ModelLifecycleRepository,
  PolicyRepository,
  RecordingRepository,
  SearchDocumentRepository,
  SpecializedIntelligenceRepository,
  SiteRepository,
  SnapshotRepository,
  StorageObjectCopyRepository,
  TenantRepository,
  StreamRepository,
  StoragePolicyAssignmentRepository,
  StorageReplicationJobRepository,
  StorageTargetRepository,
  ZoneRepository,
} from '../db/repositories/index.js';

type TenantRepositoryContract = Pick<TenantRepository, 'findById' | 'findBySlug'>;
type SiteRepositoryContract = Pick<
  SiteRepository,
  'findById' | 'findByTenantId' | 'create' | 'update' | 'delete'
>;
type ZoneRepositoryContract = Pick<
  ZoneRepository,
  'findById' | 'findBySiteId' | 'create' | 'update' | 'delete'
>;
type CameraRepositoryContract = Pick<
  CameraRepository,
  'findAll' | 'findById' | 'findBySiteId' | 'create' | 'update' | 'delete'
>;
type StreamRepositoryContract = Pick<StreamRepository, 'findByCameraId' | 'create'>;
type EnrichmentRepositoryContract = Pick<
  EnrichmentRepository,
  'findById' | 'findByTenantId' | 'findBySource' | 'findByIncidentId' | 'create' | 'update'
>;
type EventRepositoryContract = Pick<EventRepository, 'findById' | 'findByTenantId' | 'create'>;
type RecordingRepositoryContract = Pick<RecordingRepository, 'findById' | 'findByCameraId' | 'create' | 'update'>;
type ClipRepositoryContract = Pick<ClipRepository, 'findById' | 'findByCameraId' | 'create'>;
type SnapshotRepositoryContract = Pick<SnapshotRepository, 'findById' | 'findByCameraId' | 'findLatestByCameraId' | 'create'>;
type IncidentRepositoryContract = Pick<
  IncidentRepository,
  'findAll' | 'findById' | 'findByStatus' | 'acknowledge' | 'escalate' | 'close'
>;
type PolicyRepositoryContract = Pick<
  PolicyRepository,
  'findById' | 'findByTenantId' | 'findBySiteId' | 'create' | 'update' | 'delete'
>;
type AuditLogRepositoryContract = Pick<AuditLogRepository, 'log' | 'findByTenantId'>;
type AlertRouteRepositoryContract = Pick<
  AlertRouteRepository,
  'findById' | 'findByPolicyId' | 'create' | 'update' | 'delete'
>;
type SearchDocumentRepositoryContract = Pick<
  SearchDocumentRepository,
  'findByTenantId' | 'findBySource' | 'create' | 'update'
>;
type SpecializedIntelligenceRepositoryContract = Pick<
  SpecializedIntelligenceRepository,
  | 'listWatchlists'
  | 'listIdentityProfiles'
  | 'listPlateReads'
  | 'listFaceMatches'
  | 'listReIdLinks'
  | 'createWatchlist'
  | 'createIdentityProfile'
  | 'createPlateRead'
  | 'createFaceMatch'
  | 'createReIdLink'
>;
type ModelLifecycleRepositoryContract = Pick<
  ModelLifecycleRepository,
  | 'listAnnotationTasks'
  | 'listDatasetVersions'
  | 'listTrainingJobs'
  | 'listModels'
  | 'listDeployments'
  | 'createAnnotationTask'
  | 'createDatasetVersion'
  | 'createTrainingJob'
  | 'createModel'
  | 'createDeployment'
  | 'updateTrainingJob'
  | 'updateModel'
  | 'updateDeployment'
>;
type StorageTargetRepositoryContract = Pick<
  StorageTargetRepository,
  'findById' | 'findByTenantId' | 'create' | 'update' | 'delete' | 'updateStatus' | 'rotateCredentials'
>;
type StoragePolicyAssignmentRepositoryContract = Pick<
  StoragePolicyAssignmentRepository,
  'findByTargetId' | 'findBySiteId' | 'findByCameraId' | 'assignToSite' | 'assignToCamera'
>;
type StorageObjectCopyRepositoryContract = Pick<
  StorageObjectCopyRepository,
  'findById' | 'findByTenantId' | 'findByTargetId' | 'findByClipId' | 'create' | 'updateStatus'
>;
type StorageReplicationJobRepositoryContract = Pick<
  StorageReplicationJobRepository,
  'findByTenantId' | 'findByTargetId' | 'findPending' | 'create' | 'updateStatus'
>;

interface ApiCradle {
  alertRouteRepository: AlertRouteRepositoryContract;
  auditLogRepository: AuditLogRepositoryContract;
  cameraRepository: CameraRepositoryContract;
  clipRepository: ClipRepositoryContract;
  enrichmentRepository: EnrichmentRepositoryContract;
  eventRepository: EventRepositoryContract;
  incidentRepository: IncidentRepositoryContract;
  modelLifecycleRepository: ModelLifecycleRepositoryContract;
  policyRepository: PolicyRepositoryContract;
  recordingRepository: RecordingRepositoryContract;
  searchDocumentRepository: SearchDocumentRepositoryContract;
  specializedIntelligenceRepository: SpecializedIntelligenceRepositoryContract;
  siteRepository: SiteRepositoryContract;
  snapshotRepository: SnapshotRepositoryContract;
  storageObjectCopyRepository: StorageObjectCopyRepositoryContract;
  storagePolicyAssignmentRepository: StoragePolicyAssignmentRepositoryContract;
  storageReplicationJobRepository: StorageReplicationJobRepositoryContract;
  storageTargetRepository: StorageTargetRepositoryContract;
  tenantRepository: TenantRepositoryContract;
  streamRepository: StreamRepositoryContract;
  zoneRepository: ZoneRepositoryContract;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthSession;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    diContainer: {
      cradle: Partial<ApiCradle>;
    };
    getRoutePermission: (method: string, path: string) => Permission | null;
    getUserPermissions: (roles: string[]) => Set<Permission>;
  }
}
