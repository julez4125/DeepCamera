#!/bin/bash
# MinIO bucket initialization script
# Creates default buckets for the AINVR platform

set -euo pipefail
umask 077

# Configuration
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-ainvr}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-ainvr_minio_dev}"
MINIO_USE_SSL="${MINIO_USE_SSL:-false}"
MINIO_PUBLIC_ASSETS="${MINIO_PUBLIC_ASSETS:-false}"

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
echo "Public bucket exposure: $MINIO_PUBLIC_ASSETS"
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

set_private_policy() {
  local bucket="$1"
  echo "Setting policy for '$bucket' bucket..."
  mc policy set private "ainvr/$bucket"
  echo "✓ $bucket bucket set to private"
}

set_public_policy() {
  local bucket="$1"
  echo "Setting policy for '$bucket' bucket..."
  mc policy set public "ainvr/$bucket"
  echo "✓ $bucket bucket set to public (read-only)"
}

if [ "$MINIO_PUBLIC_ASSETS" = "true" ]; then
  set_public_policy clips
  set_public_policy snapshots
else
  echo "Public exposure is disabled by default; keeping all buckets private."
  set_private_policy clips
  set_private_policy snapshots
fi

set_private_policy exports
set_private_policy models

echo ""
echo "============================"
echo "MinIO initialization complete!"
echo ""
echo "Bucket summary:"
if [ "$MINIO_PUBLIC_ASSETS" = "true" ]; then
  echo "  - clips:      Public (read-only) - Video clips"
  echo "  - snapshots:  Public (read-only) - Snapshot images"
else
  echo "  - clips:      Private - Video clips"
  echo "  - snapshots:  Private - Snapshot images"
fi
echo "  - exports:    Private - Exported archives"
echo "  - models:     Private - AI model files"
echo ""
echo "Access the MinIO Console at: $PROTOCOL://$MINIO_ENDPOINT:9001"
echo "Username: $MINIO_ACCESS_KEY"
echo "Password is intentionally not echoed; use the configured secret value."
