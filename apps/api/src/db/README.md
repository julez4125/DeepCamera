# Database Layer Documentation

This directory contains the PostgreSQL database schema, migration infrastructure, and repository layer for the AI-NVR platform.

## Structure

```
src/db/
├── migrations/
│   └── 001_initial_schema.sql    # Initial schema definition
├── repositories/
│   ├── base-repository.ts        # Base CRUD operations
│   ├── tenant-repository.ts      # Tenant queries
│   ├── site-repository.ts        # Site queries
│   ├── camera-repository.ts      # Camera queries
│   ├── incident-repository.ts    # Incident queries
│   ├── audit-log-repository.ts   # Audit log queries
│   └── index.ts                  # Barrel export
├── __tests__/
│   └── repositories.test.ts      # Unit tests (mock-based)
├── pool.ts                       # Connection pool management
├── migrator.ts                   # Migration runner
└── README.md                     # This file
```

## Quick Start

### 1. Initialize the Database Pool

```typescript
import { initializePool, getPool } from './db/pool';

// In your application startup
await initializePool();

// Throughout your app
const pool = getPool();
```

### 2. Run Migrations

```typescript
import { runMigrations, getMigrationStatus } from './db/migrator';
import { getPool } from './db/pool';

const pool = getPool();

// Apply pending migrations
await runMigrations(pool);

// Check migration status
await getMigrationStatus(pool);
```

### 3. Use Repositories

```typescript
import { 
  TenantRepository, 
  CameraRepository,
  IncidentRepository 
} from './db/repositories';
import { getPool } from './db/pool';

const pool = getPool();

// Create repositories
const tenantRepo = new TenantRepository(pool);
const cameraRepo = new CameraRepository(pool);
const incidentRepo = new IncidentRepository(pool);

// Use repository methods
const tenant = await tenantRepo.create({ name: 'Acme Corp', slug: 'acme-corp' });
const cameras = await cameraRepo.findBySiteId(siteId, { limit: 10, offset: 0 });
await incidentRepo.acknowledge(incidentId, userId);
```

## Database Configuration

The database connection is configured via environment variable:

```bash
DATABASE_URL=postgresql://ainvr:ainvr_dev@localhost:5432/ainvr
```

### Default Values (Development)

- **Host**: localhost
- **Port**: 5432 (Docker)
- **Database**: ainvr
- **User**: ainvr
- **Password**: ainvr_dev

Connection pool settings:
- **Max connections**: 20
- **Idle timeout**: 30 seconds
- **Connection timeout**: 2 seconds

### Retry Logic

The pool initialization includes exponential backoff retry logic to handle Docker startup timing:
- **Max attempts**: 5
- **Initial delay**: 1000ms
- **Backoff multiplier**: 2x

## Schema Overview

### Core Tables

#### Tenants
Multi-tenant isolation at the database level.
- `id` (UUID): Primary key
- `slug` (VARCHAR): Unique tenant identifier
- `name` (VARCHAR): Display name
- Indexed: slug

#### Sites
Physical locations within a tenant.
- `tenant_id` (UUID FK)
- `timezone` (VARCHAR): Default 'UTC'
- `address` (TEXT): Optional location
- Indexed: tenant_id

#### Zones
Restricted areas within a site.
- `site_id` (UUID FK)
- `polygon` (JSONB): GeoJSON polygon
- `zone_type` (VARCHAR): 'restricted' (enum)
- Indexed: site_id

#### Cameras
Video sources.
- `site_id` (UUID FK)
- `protocol` (VARCHAR): 'rtsp', 'onvif', 'http', 'hls'
- `status` (VARCHAR): 'online', 'offline', 'degraded', 'unknown'
- `detection_enabled` (BOOLEAN)
- `recording_enabled` (BOOLEAN)
- Indexed: site_id, status

#### Streams
Individual streams from a camera.
- `camera_id` (UUID FK)
- `stream_type` (VARCHAR): 'main', 'sub', 'snapshot'
- `active` (BOOLEAN)
- Indexed: camera_id

#### Recordings
Continuous recordings from cameras.
- `camera_id` (UUID FK)
- `start_time` / `end_time` (TIMESTAMPTZ)
- `file_size` (BIGINT)
- `recording_mode` (VARCHAR): 'continuous'
- Indexed: camera_id, start_time DESC

#### Clips
Extracted video segments.
- `camera_id` (UUID FK)
- `recording_id` (UUID FK): Optional reference
- `start_time` / `end_time` (TIMESTAMPTZ)
- `metadata` (JSONB): Flexible data
- `thumbnail_path` (TEXT)
- Indexed: camera_id, start_time DESC

#### Events
Individual detection/system events.
- `camera_id` (UUID FK)
- `site_id` (UUID FK)
- `tenant_id` (UUID FK)
- `event_type` (VARCHAR): Detection class
- `severity` (VARCHAR): 'info', 'low', 'medium', 'high', 'critical'
- `payload` (JSONB): Event-specific data
- `correlation_id` (UUID): For grouping related events
- Indexed: camera_id+timestamp DESC, tenant_id+timestamp DESC, severity, type, correlation_id

#### Incidents
Aggregated security incidents.
- `tenant_id` (UUID FK)
- `site_id` (UUID FK)
- `status` (VARCHAR): 'open', 'acknowledged', 'investigating', 'resolved', 'closed'
- `severity` (VARCHAR): 'low', 'medium', 'high', 'critical'
- `confidence` (FLOAT): 0.0-1.0
- `camera_ids` (UUID[]): Array of involved cameras
- `escalation_state` (VARCHAR): 'none', 'escalated', 'critical'
- `acknowledged_by` / `acknowledged_at` (UUID / TIMESTAMPTZ)
- `policy_hits` (JSONB): Matching policies
- Indexed: tenant_id+status, site_id+created_at DESC, severity

#### Policies
Detection/alert rules.
- `tenant_id` (UUID FK)
- `site_id` (UUID FK): Optional for site-specific policies
- `conditions` (JSONB): Rule conditions
- `schedule` (JSONB): Time-based activation
- `severity_rules` (JSONB): Mapping to incident severity
- `armed_state` (VARCHAR): 'armed', 'disarmed', 'partial'
- Indexed: tenant_id

#### Alert Routes
Channels for policy notifications.
- `policy_id` (UUID FK)
- `channel` (VARCHAR): 'webhook', 'mqtt', 'telegram', 'discord', 'slack', 'email'
- `config` (JSONB): Channel-specific configuration
- Indexed: policy_id

#### Models
ML/AI detection models.
- `family` (VARCHAR): Model type (e.g., 'yolov8', 'resnet')
- `version` (VARCHAR): Semantic version
- `format` (VARCHAR): Model format (e.g., 'onnx', 'tflite')
- `metadata` (JSONB): Optional model info

#### Model Deployments
Model instances on workers.
- `model_id` (UUID FK)
- `worker_type` (VARCHAR): Target hardware
- `status` (VARCHAR): 'pending', 'deployed'
- `config` (JSONB): Deployment parameters

#### Audit Logs
User action tracking.
- `tenant_id` (UUID FK)
- `user_id` (UUID): Logged user
- `action` (VARCHAR): Action performed
- `resource_type` (VARCHAR): Target resource type
- `resource_id` (UUID): Target resource ID
- `details` (JSONB): Additional context
- `ip_address` (VARCHAR): User IP
- Indexed: tenant_id+created_at DESC, user_id, action

#### Incident Events (Junction)
Many-to-many relationship between incidents and events.
- Composite PK: (incident_id, event_id)
- Both FKs cascade on delete

### Timestamps and Triggers

All tables except `streams`, `audit_logs`, and `recordings` have:
- `created_at` (TIMESTAMPTZ): Set once at creation
- `updated_at` (TIMESTAMPTZ): Auto-updated on row modification

The `trigger_set_timestamp()` function automatically updates `updated_at` before any UPDATE operation.

### Extensions Used

- `uuid-ossp`: UUID generation (gen_random_uuid())
- `pgcrypto`: For pgcrypto functions (included with uuid-ossp)

## Repository Classes

### BaseRepository<T>

Abstract base class for all repositories. Provides:

#### Methods
- `findById(id): Promise<T | null>` - Get by primary key
- `findAll(filters?, pagination?): Promise<PaginatedResult<T>>` - List with filtering
- `create(data): Promise<T>` - Insert record
- `update(id, data): Promise<T | null>` - Update record
- `delete(id): Promise<boolean>` - Delete record
- `count(filters?): Promise<number>` - Count records

#### Pagination
```typescript
interface PaginationOptions {
  limit?: number;  // Default: 100
  offset?: number; // Default: 0
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
```

### TenantRepository

Extends BaseRepository. Additional methods:
- `findBySlug(slug): Promise<Tenant | null>` - Find tenant by unique slug

### SiteRepository

Extends BaseRepository. Additional methods:
- `findByTenantId(tenantId, pagination?): Promise<PaginatedResult<Site>>` - List sites for a tenant

### CameraRepository

Extends BaseRepository. Additional methods:
- `findBySiteId(siteId, pagination?): Promise<PaginatedResult<Camera>>` - List cameras for a site
- `updateStatus(id, status): Promise<Camera | null>` - Update camera status

### IncidentRepository

Extends BaseRepository. Additional methods:
- `findByStatus(tenantId, status, pagination?): Promise<PaginatedResult<Incident>>` - Find incidents by status
- `acknowledge(id, userId): Promise<Incident | null>` - Mark incident as acknowledged
- `escalate(id): Promise<Incident | null>` - Escalate incident severity
- `close(id): Promise<Incident | null>` - Close incident

### AuditLogRepository

Extends BaseRepository. Additional methods:
- `log(tenantId, userId, action, resourceType, resourceId?, details?, ipAddress?): Promise<AuditLog>` - Create audit entry
- `findByTenantId(tenantId, pagination?): Promise<PaginatedResult<AuditLog>>` - List tenant's audit logs
- `findByUserId(userId, pagination?): Promise<PaginatedResult<AuditLog>>` - List user's actions
- `findByAction(action, pagination?): Promise<PaginatedResult<AuditLog>>` - Find actions by type

## Security Features

### SQL Injection Prevention
All queries use parameterized statements with positional placeholders (`$1`, `$2`, etc.). Values are never interpolated directly into SQL strings.

### Credential Encryption
Camera credentials are stored encrypted in the `camera_credentials` table:
- `username_enc` (BYTEA): Encrypted username
- `password_enc` (BYTEA): Encrypted password

Application layer must handle encryption/decryption using a key management service.

### Audit Trail
All user actions are logged via `AuditLogRepository.log()`:
- Tenant isolation
- User identification
- IP address tracking
- Timestamped records

### Tenant Isolation
- Every multi-tenant table includes `tenant_id` (FK to tenants)
- Foreign key constraints enforce referential integrity
- Queries should always filter by `tenant_id` in application layer

## Migration Management

### Running Migrations

```typescript
import { runMigrations } from './db/migrator';
import { getPool } from './db/pool';

const pool = await initializePool();
await runMigrations(pool);
```

### Checking Status

```typescript
import { getMigrationStatus } from './db/migrator';

await getMigrationStatus(pool);
// Output:
// === Migration Status ===
// ✓ Applied - 001_initial_schema.sql
// Total: 1 migrations, 1 applied, 0 pending
```

### Adding New Migrations

1. Create a new SQL file in `migrations/` directory:
   ```
   002_add_feature.sql
   003_update_schema.sql
   ```

2. Files are executed in alphabetical order
3. The migrator tracks which have been applied in the `schema_migrations` table
4. Rollback is not supported (manual intervention required)

### Important Notes

- Migrations are idempotent where possible (use `IF NOT EXISTS`, etc.)
- For production use, consider `node-pg-migrate` or `Flyway` for rollback support
- Always backup before running migrations on production
- Test migrations on a staging environment first

## Testing

### Unit Tests

Located in `__tests__/repositories.test.ts`. Uses Vitest with mock pool:

```bash
npm test -- src/db/__tests__/repositories.test.ts
```

Tests cover:
- Creating and retrieving tenants
- Finding cameras by site
- Acknowledging and escalating incidents
- Logging audit entries

### Integration Tests (Future)

To test against a real database:

```typescript
import { Pool } from 'pg';
import { TenantRepository } from './repositories';

describe('TenantRepository Integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create and retrieve a tenant', async () => {
    const repo = new TenantRepository(pool);
    const tenant = await repo.create({ name: 'Test', slug: 'test' });
    const found = await repo.findById(tenant.id);
    expect(found).toEqual(tenant);
  });
});
```

## Performance Considerations

### Indexes

Critical queries are indexed:
- Tenant lookups by ID and slug
- Site/Camera/Incident queries by tenant (common filter)
- Event queries by time range and type (common reporting queries)
- Audit logs by tenant and time

### Query Patterns

- Use pagination for large result sets (cameras, events, incidents)
- Consider denormalizing frequently queried aggregations (incident counts, etc.)
- Incidents table includes `camera_ids` array for quick access without junction table join

### Connection Pool

- Default 20 max connections
- Idle timeout 30s to reclaim connections
- Set `DATABASE_URL` for production to tune connection count

### Future Optimizations

- Materialized views for incident/event aggregations
- Partitioning events table by date (for high-volume deployments)
- Read replicas for reporting queries
- Caching layer (Redis) for frequently accessed data

## Environment Variables

```bash
# PostgreSQL connection
DATABASE_URL=postgresql://ainvr:ainvr_dev@localhost:5432/ainvr

# Optional: Override connection pool settings
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=2000
```

## Related Documentation

- Domain schemas: `packages/contracts/src/domains/`
- API routes: `apps/api/src/routes/`
- Docker setup: `docker-compose.dev.yml`
