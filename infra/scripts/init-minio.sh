#!/bin/bash
# MinIO bucket initialization script
# Creates default buckets for the AINVR platform

set -e

# Configuration
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-ainvr}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-ainvr_minio_dev}"
MINIO_USE_SSL="${MINIO_USE_SSL:-false}"

# Determine protocol
PROTOCOL="http"
if [ "$MINIO_USE_SSL" = "true" ]; then
  PROTOCOL="https"
fi

# Buckets to create
BUCKETS=("clips" "snapshots" "exports" "models")

echo "MinIO Initialization Script"
echo "============================"
echo "Endpoint: $PROTOCOL://$MINIO_ENDPOINT"
echo "Access Key: $MINIO_ACCESS_KEY"
echo ""

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
for i in {1..30}; do
  if curl -f -s "$PROTOCOL://$MINIO_ENDPOINT/minio/health/live" > /dev/null 2>&1; then
    echo "MinIO is ready!"
    break
  fi
  echo "Attempt $i: MinIO not ready yet, waiting..."
  sleep 2
done

# Set up mc (MinIO client) alias
echo "Configuring MinIO client..."
mc alias set ainvr "$PROTOCOL://$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4

# Create buckets
echo ""
echo "Creating buckets..."
for bucket in "${BUCKETS[@]}"; do
  if mc ls "ainvr/$bucket" > /dev/null 2>&1; then
    echo "✓ Bucket '$bucket' already exists"
  else
    echo "Creating bucket '$bucket'..."
    mc mb "ainvr/$bucket"
    echo "✓ Bucket '$bucket' created successfully"
  fi
done

# Set bucket policies for public access (clips and snapshots readable)
echo ""
echo "Setting bucket policies..."

# Clips bucket: allow public read access
echo "Setting policy for 'clips' bucket..."
mc policy set public "ainvr/clips"
echo "✓ Clips bucket set to public (read-only)"

# Snapshots bucket: allow public read access
echo "Setting policy for 'snapshots' bucket..."
mc policy set public "ainvr/snapshots"
echo "✓ Snapshots bucket set to public (read-only)"

# Exports bucket: private
echo "Setting policy for 'exports' bucket..."
mc policy set private "ainvr/exports"
echo "✓ Exports bucket set to private"

# Models bucket: private
echo "Setting policy for 'models' bucket..."
mc policy set private "ainvr/models"
echo "✓ Models bucket set to private"

echo ""
echo "============================"
echo "MinIO initialization complete!"
echo ""
echo "Bucket summary:"
echo "  - clips:      Public (read-only) - Video clips"
echo "  - snapshots:  Public (read-only) - Snapshot images"
echo "  - exports:    Private - Exported archives"
echo "  - models:     Private - AI model files"
echo ""
echo "Access the MinIO Console at: $PROTOCOL://$MINIO_ENDPOINT:9001"
echo "Username: $MINIO_ACCESS_KEY"
echo "Password: $MINIO_SECRET_KEY"
