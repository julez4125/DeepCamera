#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail() {
  echo "Security hardening check failed: $1" >&2
  exit 1
}

require_file() {
  local path="$1"
  [ -f "$ROOT_DIR/$path" ] || fail "missing required file: $path"
}

require_contains() {
  local path="$1"
  local needle="$2"

  grep -Fq "$needle" "$ROOT_DIR/$path" || fail "expected '$needle' in $path"
}

require_file "infra/docker/Dockerfile.api"
require_file "infra/docker/Dockerfile.web"
require_file ".github/workflows/security-hardening.yml"
require_file "infra/k8s/security/platform-hardening.yaml"
require_file "infra/security/secret-handling.md"
require_file "infra/scripts/init-minio.sh"

require_contains "infra/docker/Dockerfile.api" "USER nodejs"
require_contains "infra/docker/Dockerfile.api" "HEALTHCHECK"
require_contains "infra/docker/Dockerfile.api" "dumb-init"
require_contains "infra/docker/Dockerfile.web" "USER nodejs"
require_contains "infra/docker/Dockerfile.web" "HEALTHCHECK"
require_contains "infra/docker/Dockerfile.web" "dumb-init"
require_contains "infra/docker/Dockerfile.web" "NODE_ENV=production"

require_contains "infra/k8s/security/platform-hardening.yaml" "pod-security.kubernetes.io/enforce: restricted"
require_contains "infra/k8s/security/platform-hardening.yaml" "default-deny-all"
require_contains "infra/k8s/security/platform-hardening.yaml" "allow-dns-egress"
require_contains "infra/k8s/security/platform-hardening.yaml" "allow-intra-namespace-traffic"

require_contains "infra/security/secret-handling.md" "MINIO_PUBLIC_ASSETS"
require_contains "infra/security/secret-handling.md" "Do not commit real secrets"

require_contains ".github/workflows/security-hardening.yml" "Security Hardening"
require_contains ".github/workflows/security-hardening.yml" "bash infra/scripts/security-hardening-check.sh"

require_contains "infra/scripts/init-minio.sh" 'MINIO_PUBLIC_ASSETS="${MINIO_PUBLIC_ASSETS:-false}"'
require_contains "infra/scripts/init-minio.sh" 'umask 077'
require_contains "infra/scripts/init-minio.sh" 'set_private_policy exports'
require_contains "infra/scripts/init-minio.sh" 'Password is intentionally not echoed'

echo "Security hardening checks passed."
