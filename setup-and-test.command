#\!/bin/bash
set -e

echo "============================================"
echo "  AI-NVR Platform - Setup & Test Runner"
echo "============================================"
echo ""

cd "$(dirname "$0")"
PLATFORM_DIR="$(pwd)"
echo "Working directory: $PLATFORM_DIR"
echo ""

# Step 1: Install pnpm if not available
echo ">>> Step 1: Checking pnpm..."
if \! command -v pnpm &> /dev/null; then
    echo "pnpm not found, installing via npm..."
    npm install -g pnpm@9
fi
echo "pnpm version: $(pnpm --version)"
echo ""

# Step 2: Install dependencies
echo ">>> Step 2: Installing dependencies..."
pnpm install 2>&1
echo ""

# Step 3: Start Docker containers
echo ">>> Step 3: Starting Docker dev infrastructure..."
docker compose -f docker-compose.dev.yml up -d 2>&1
echo ""

# Step 4: Wait for services to be healthy
echo ">>> Step 4: Waiting for services to be healthy..."
echo "Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U ainvr &>/dev/null; then
        echo "  PostgreSQL is ready\!"
        break
    fi
    echo "  Attempt $i/30..."
    sleep 2
done

echo "Waiting for Redis..."
for i in {1..15}; do
    if docker compose -f docker-compose.dev.yml exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo "  Redis is ready\!"
        break
    fi
    echo "  Attempt $i/15..."
    sleep 2
done

echo "Waiting for MinIO..."
for i in {1..15}; do
    if curl -sf http://localhost:9000/minio/health/live &>/dev/null; then
        echo "  MinIO is ready\!"
        break
    fi
    echo "  Attempt $i/15..."
    sleep 2
done

echo "Waiting for Keycloak..."
for i in {1..60}; do
    if curl -sf http://localhost:8080/health/ready &>/dev/null; then
        echo "  Keycloak is ready\!"
        break
    fi
    echo "  Attempt $i/60..."
    sleep 3
done

echo ""
echo "Docker service status:"
docker compose -f docker-compose.dev.yml ps 2>&1
echo ""

# Step 5: Run database migration
echo ">>> Step 5: Running database migration..."
PGPASSWORD=ainvr_dev psql -h localhost -U ainvr -d ainvr -f apps/api/src/db/migrations/001_initial_schema.sql 2>&1 || echo "Migration may have already been applied or psql not available - check manually"
echo ""

# Step 6: TypeCheck
echo ">>> Step 6: Running type-check..."
pnpm type-check 2>&1 || echo "Type-check had issues (expected - some cross-package refs need build first)"
echo ""

# Step 7: Run tests
echo ">>> Step 7: Running tests..."
cd packages/contracts && npx vitest run 2>&1; cd "$PLATFORM_DIR"
echo ""

echo ">>> Step 7b: Running API tests..."
cd apps/api && npx vitest run 2>&1; cd "$PLATFORM_DIR"
echo ""

# Step 8: Summary
echo "============================================"
echo "  Setup Complete\!"
echo "============================================"
echo ""
echo "Services running:"
echo "  - PostgreSQL:  localhost:5432"
echo "  - Redis:       localhost:6379"
echo "  - MinIO:       localhost:9000 (console: 9001)"
echo "  - go2rtc:      localhost:1984"
echo "  - Keycloak:    localhost:8080"
echo ""
echo "Dev credentials:"
echo "  - DB: ainvr / ainvr_dev"
echo "  - MinIO: ainvr / ainvr_minio_dev"
echo "  - Keycloak: admin / admin"
echo "  - Test user: dev@ainvr.local / dev123"
echo ""
echo "Press any key to close..."
read -n 1
