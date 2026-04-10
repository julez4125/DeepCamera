CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
  clip_id UUID REFERENCES clips(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
  width INTEGER,
  height INTEGER,
  checksum VARCHAR(128),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(20) NOT NULL DEFAULT 'camera'
    CHECK (source IN ('camera', 'stream', 'recording', 'clip', 'detection')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_snapshots_camera_time ON snapshots(camera_id, captured_at DESC);
CREATE INDEX idx_snapshots_recording ON snapshots(recording_id);
CREATE INDEX idx_snapshots_clip ON snapshots(clip_id);
