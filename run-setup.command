#\!/bin/bash
set -e

echo "============================================"
echo "  AI-NVR Platform - Setup & Test (v2)"
echo "============================================"
cd "$(dirname "$0")"
echo "Dir: $(pwd)"
echo ""

# Step 1: pnpm
echo ">>> Step 1: pnpm install..."
if \! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi
echo "pnpm: $(pnpm --version)"
pnpm install --no-frozen-lockfile 2>&1
echo ""

# Step 2: Docker
echo ">>> Step 2: Docker compose up..."
docker compose -f docker-compose.dev.yml up -d 2>&1
echo ""

# Step 3: Wait for health
echo ">>> Step 3: Waiting for services..."
sleep 5
for svc in postgres redis minio; do
    echo -n "  $svc: "
    docker compose -f docker-compose.dev.yml ps $svc --format '{{.Status}}' 2>/dev/null || echo "checking..."
done
echo ""

# Wait specifically for postgres
echo "Waiting for PostgreSQL..."
for i in {1..20}; do
    if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U ainvr &>/dev/null; then
        echo "  PostgreSQL ready\!"
        break
    fi
    sleep 2
done
echo ""

# Step 4: DB Migration
echo ">>> Step 4: Running DB migration..."
docker compose -f docker-compose.dev.yml exec -T postgres psql -U ainvr -d ainvr < apps/api/src/db/migrations/001_initial_schema.sql 2>&1 || echo "Migration may already be applied"
echo ""

# Step 5: Tests
echo ">>> Step 5: Running contract tests..."
cd packages/contracts
npx vitest run --reporter=verbose 2>&1 || true
cd ../..
echo ""

echo ">>> Step 5b: Running API tests..."
cd apps/api
npx vitest run --reporter=verbose 2>&1 || true
cd ../..
echo ""

# Step 6: Docker status
echo ">>> Step 6: Final Docker status..."
docker compose -f docker-compose.dev.yml ps 2>&1
echo ""

# Step 7: DB tables
echo ">>> Step 7: Checking DB tables..."
docker compose -f docker-compose.dev.yml exec -T postgres psql -U ainvr -d ainvr -c "\dt" 2>&1 || echo "Could not query tables"
echo ""

echo "============================================"
echo "  DONE\! Press any key to close."
echo "============================================"
read -n 1
