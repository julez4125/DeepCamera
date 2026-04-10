// Pool exports
export { initializePool, getPool, query, transaction } from './pool';

// Migrator exports
export { runMigrations, getMigrationStatus, rollback } from './migrator';

// Repository exports
export {
  BaseRepository,
  type PaginationOptions,
  type PaginatedResult,
} from './repositories/base-repository';

export {
  TenantRepository,
  type Tenant,
} from './repositories/tenant-repository';

export {
  SiteRepository,
  type Site,
} from './repositories/site-repository';

export {
  PolicyRepository,
  type Policy,
  type PolicyArmedState,
} from './repositories/policy-repository';

export {
  ZoneRepository,
  type Zone,
  type ZoneType,
} from './repositories/zone-repository';

export {
  CameraRepository,
  type Camera,
  type CameraStatus,
  type CameraProtocol,
} from './repositories/camera-repository';

export {
  StreamRepository,
  type Stream,
  type StreamType,
} from './repositories/stream-repository';

export {
  EventRepository,
  type EventRecord,
  type EventSeverity,
} from './repositories/event-repository';

export {
  RecordingRepository,
  type Recording,
  type RecordingMode,
} from './repositories/recording-repository';

export {
  ClipRepository,
  type Clip,
} from './repositories/clip-repository';

export {
  SnapshotRepository,
  type Snapshot,
  type SnapshotSource,
} from './repositories/snapshot-repository';

export {
  IncidentRepository,
  type Incident,
  type IncidentStatus,
  type IncidentSeverity,
  type EscalationState,
  type IncidentEvidenceReference,
} from './repositories/incident-repository';

export {
  AuditLogRepository,
  type AuditLog,
} from './repositories/audit-log-repository';

export {
  AlertRouteRepository,
  type AlertRoute,
  type AlertChannel,
} from './repositories/alert-route-repository';

export {
  StorageTargetRepository,
  type StorageTarget,
  type StorageTargetType,
  type StorageTargetStatus,
  type StorageTargetCredentialRecord,
} from './repositories/storage-target-repository';

export {
  StoragePolicyAssignmentRepository,
  type StoragePolicyAssignment,
  type StoragePolicyAssignmentInput,
} from './repositories/storage-policy-assignment-repository';

export {
  StorageObjectCopyRepository,
  type StorageObjectCopy,
  type StorageObjectCopyStatus,
} from './repositories/storage-object-copy-repository';

export {
  StorageReplicationJobRepository,
  type StorageReplicationJob,
  type StorageReplicationJobStatus,
} from './repositories/storage-replication-job-repository';
