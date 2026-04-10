CREATE TABLE storage_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('s3', 'smb', 'nfs', 'local')),
  status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'healthy', 'degraded', 'unreachable')),
  config JSONB NOT NULL DEFAULT '{}',
  capabilities JSONB NOT NULL DEFAULT '{}',
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_storage_targets_tenant ON storage_targets(tenant_id);

CREATE TABLE storage_target_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_target_id UUID NOT NULL UNIQUE REFERENCES storage_targets(id) ON DELETE CASCADE,
  credentials JSONB NOT NULL DEFAULT '{}',
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE camera_storage_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_target_id UUID NOT NULL REFERENCES storage_targets(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
  path_prefix TEXT,
  retention_days INTEGER NOT NULL DEFAULT 30,
  replication_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT camera_storage_policies_scope_check
    CHECK (((site_id IS NOT NULL)::int + (camera_id IS NOT NULL)::int) = 1)
);
CREATE INDEX idx_camera_storage_policies_tenant ON camera_storage_policies(tenant_id);
CREATE INDEX idx_camera_storage_policies_target ON camera_storage_policies(storage_target_id);
CREATE INDEX idx_camera_storage_policies_site ON camera_storage_policies(site_id);
CREATE INDEX idx_camera_storage_policies_camera ON camera_storage_policies(camera_id);

CREATE TABLE storage_object_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
  storage_target_id UUID NOT NULL REFERENCES storage_targets(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL,
  copy_status VARCHAR(20) NOT NULL DEFAULT 'local_only'
    CHECK (copy_status IN ('local_only', 'replicating', 'replicated', 'degraded', 'failed')),
  checksum VARCHAR(128),
  size_bytes BIGINT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_storage_object_copies_target ON storage_object_copies(storage_target_id);
CREATE INDEX idx_storage_object_copies_tenant ON storage_object_copies(tenant_id);

CREATE TABLE storage_replication_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_target_id UUID NOT NULL REFERENCES storage_targets(id) ON DELETE CASCADE,
  object_copy_id UUID REFERENCES storage_object_copies(id) ON DELETE SET NULL,
  source_path TEXT NOT NULL,
  destination_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  bytes_total BIGINT NOT NULL DEFAULT 0,
  bytes_transferred BIGINT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_storage_replication_jobs_target ON storage_replication_jobs(storage_target_id, created_at DESC);
CREATE INDEX idx_storage_replication_jobs_tenant ON storage_replication_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_storage_replication_jobs_status ON storage_replication_jobs(status);

CREATE TRIGGER set_timestamp_storage_targets BEFORE UPDATE ON storage_targets FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_storage_target_credentials BEFORE UPDATE ON storage_target_credentials FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_camera_storage_policies BEFORE UPDATE ON camera_storage_policies FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_storage_object_copies BEFORE UPDATE ON storage_object_copies FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_storage_replication_jobs BEFORE UPDATE ON storage_replication_jobs FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
