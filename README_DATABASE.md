# AI-NVR Database Layer - Complete Implementation

This directory contains the complete PostgreSQL database schema v1 and migration infrastructure for the AI-NVR platform.

## Quick Navigation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [DB_SETUP_SUMMARY.md](./DB_SETUP_SUMMARY.md) | Overview of all components created | 5 min |
| [DATABASE_VERIFICATION.md](./DATABASE_VERIFICATION.md) | Verification checklist | 3 min |
| [apps/api/src/db/README.md](./apps/api/src/db/README.md) | Complete technical documentation | 15 min |
| [apps/api/src/db/QUICK_REFERENCE.md](./apps/api/src/db/QUICK_REFERENCE.md) | Common patterns & operations | 10 min |
| [apps/api/DEPENDENCIES.md](./apps/api/DEPENDENCIES.md) | Dependencies to install | 2 min |

## 30-Second Summary

Complete production-ready PostgreSQL database layer for AI-NVR platform:

✓ **16 tables** covering MVP requirements (tenants, sites, zones, cameras, events, incidents, etc.)
✓ **5 repository classes** providing type-safe data access
✓ **Connection pooling** with exponential backoff retry logic
✓ **Automatic migrations** system with tracking
✓ **SQL injection prevention** via parameterized queries throughout
✓ **Unit tests** with mock pool (no DB required)
✓ **Complete documentation** with examples
✓ **Multi-tenant architecture** with proper isolation
✓ **Audit logging** for all user actions

## File Structure

```
platform/
├── README_DATABASE.md                    # This file
├── DB_SETUP_SUMMARY.md                   # Component overview
├── DATABASE_VERIFICATION.md              # Verification checklist
│
├── apps/api/
│   ├── .env.example                      # Environment template
│   ├── DEPENDENCIES.md                   # npm dependencies needed
│   │
│   └── src/db/
│       ├── README.md                     # Complete documentation
│       ├── QUICK_REFERENCE.md            # Common patterns
│       ├── init.example.ts               # Implementation examples
│       │
│       ├── index.ts                      # Module barrel export
│       ├── pool.ts                       # Connection pool (138 lines)
│       ├── migrator.ts                   # Migration runner (156 lines)
│       │
│       ├── migrations/
│       │   └── 001_initial_schema.sql    # Complete schema (329 lines)
│       │
│       ├── repositories/
│       │   ├── index.ts                  # Barrel export
│       │   ├── base-repository.ts        # CRUD base class (189 lines)
│       │   ├── tenant-repository.ts      # Tenant queries (25 lines)
│       │   ├── site-repository.ts        # Site queries (49 lines)
│       │   ├── camera-repository.ts      # Camera queries (81 lines)
│       │   ├── incident-repository.ts    # Incident queries (129 lines)
│       │   └── audit-log-repository.ts   # Audit queries (149 lines)
│       │
│       └── __tests__/
│           └── repositories.test.ts      # Unit tests (400+ lines)
```

## Getting Started (5 Minutes)

### 1. Install Dependencies

```bash
cd platform/apps/api
npm install pg @types/pg
```

### 2. Set Environment

Create `.env` (copy from `.env.example`):
```bash
DATABASE_URL=postgresql://ainvr:ainvr_dev@localhost:5432/ainvr
NODE_ENV=development
```

### 3. Initialize Database

In your application startup (`src/main.ts`, `src/server.ts`, etc.):

```typescript
import { initializePool, runMigrations } from './db';

async function main() {
  // Initialize connection pool and run migrations
  const pool = await initializePool();
  await runMigrations(pool);
  
  // Now use repositories throughout your app
  console.log('Database ready!');
}

main().catch(console.error);
```

### 4. Use Repositories

```typescript
import { TenantRepository, CameraRepository, getPool } from './db';

const pool = getPool();
const tenantRepo = new TenantRepository(pool);
const cameraRepo = new CameraRepository(pool);

// Create
const tenant = await tenantRepo.create({ 
  name: 'Acme Corp', 
  slug: 'acme' 
});

// Read
const found = await tenantRepo.findById(tenant.id);

// List with pagination
const tenants = await tenantRepo.findAll({}, { 
  limit: 10, 
  offset: 0 
});

// Update
const updated = await cameraRepo.updateStatus(cameraId, 'offline');

// Delete
const deleted = await tenantRepo.delete(tenantId);
```

### 5. Run Tests

```bash
npm test -- src/db/__tests__/repositories.test.ts
```

## Architecture Overview

### Connection Pool (`pool.ts`)

- Singleton pattern ensures single connection pool
- Exponential backoff retry (5 attempts, 1-10 second delays)
- Graceful shutdown handling
- Helper functions: `initializePool()`, `getPool()`, `query()`, `transaction()`

```typescript
const pool = await initializePool();
const results = await query('SELECT * FROM cameras', []);
await transaction(async (client) => { /* ... */ });
```

### Migration System (`migrator.ts`)

- Automatic `schema_migrations` table creation
- File-based discovery (reads .sql files in order)
- Idempotent tracking of applied migrations
- Status reporting and rollback prevention

```typescript
await runMigrations(pool);      // Apply pending
await getMigrationStatus(pool); // Show status
```

### Repository Pattern

Type-safe data access with automatic SQL parameter binding:

```typescript
class CameraRepository extends BaseRepository<Camera> {
  async findBySiteId(siteId, pagination) { 
    // Parameterized queries prevent SQL injection
    return this.query(
      'SELECT * FROM cameras WHERE site_id = $1',
      [siteId]
    );
  }
}
```

## Database Schema at a Glance

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|------------|
| tenants | Multi-tenant isolation | id, slug, name |
| sites | Physical locations | id, tenant_id, timezone |
| cameras | Video sources | id, site_id, protocol, status |
| events | Detection events | id, camera_id, event_type, severity |
| incidents | Aggregated incidents | id, tenant_id, status, severity |
| policies | Detection rules | id, tenant_id, conditions |
| audit_logs | User actions | id, tenant_id, action, resource_type |

### Additional Tables

- **zones**: Restricted areas
- **streams**: Individual camera streams
- **recordings**: Continuous video files
- **clips**: Extracted video segments
- **camera_credentials**: Encrypted camera authentication
- **incident_events**: Event-to-incident relationship
- **alert_routes**: Policy notification channels
- **models**: ML/AI detection models
- **model_deployments**: Model instances on workers

### Key Features

- ✓ **16 tables** with proper relationships
- ✓ **UUID primary keys** with automatic generation
- ✓ **Comprehensive indexes** for query performance
- ✓ **CHECK constraints** on enum columns
- ✓ **Foreign key cascades** for referential integrity
- ✓ **JSONB columns** for flexible data storage
- ✓ **Automatic timestamps** (created_at, updated_at)

## Security Highlights

### SQL Injection Prevention
Every query uses parameterized statements:
```typescript
// ✓ SAFE: Parameter binding
query('SELECT * FROM users WHERE id = $1', [userId])

// ✗ UNSAFE: String interpolation (not used)
query(`SELECT * FROM users WHERE id = ${userId}`)
```

### Multi-Tenant Isolation
Every multi-tenant table includes `tenant_id`:
```typescript
// Application must always filter by tenant
query('SELECT * FROM cameras WHERE site_id = $1 AND tenant_id = $2', [siteId, tenantId])
```

### Audit Trail
All user actions logged:
```typescript
await auditLogRepo.log(
  tenantId,      // Which tenant
  userId,        // Who did it
  'CREATE',      // What action
  'CAMERA',      // On what resource
  cameraId,      // Which resource
  { metadata },  // Additional context
  ipAddress      // From where
);
```

### Encrypted Credentials
Camera passwords stored as BYTEA for application-layer encryption:
```typescript
CREATE TABLE camera_credentials (
  id UUID PRIMARY KEY,
  camera_id UUID NOT NULL UNIQUE,
  username_enc BYTEA,    // Encrypted by application
  password_enc BYTEA     // Encrypted by application
);
```

## Common Patterns

### Create with Audit Log

```typescript
const camera = await cameraRepo.create(data);
await auditLogRepo.log(
  tenantId, userId, 'CREATE', 'CAMERA', camera.id,
  { name: camera.name }, req.ip
);
```

### Update in Transaction

```typescript
await transaction(async (client) => {
  await client.query('UPDATE cameras SET status = $1', ['offline']);
  await client.query('INSERT INTO events (camera_id, event_type) VALUES ($1, $2)', 
    [cameraId, 'offline']);
});
```

### Pagination for Large Result Sets

```typescript
const pageSize = 25;
const pageNum = req.query.page || 0;

const result = await cameraRepo.findBySiteId(siteId, {
  limit: pageSize,
  offset: pageNum * pageSize
});

res.json({
  data: result.data,
  pagination: {
    total: result.total,
    page: pageNum,
    pageSize: result.limit,
    hasMore: result.offset + result.limit < result.total
  }
});
```

### Error Handling

```typescript
try {
  const tenant = await tenantRepo.create({ slug: 'acme' });
} catch (error: any) {
  if (error.code === '23505') {
    // Unique constraint - slug already exists
    res.status(409).json({ error: 'Slug already taken' });
  } else if (error.code === '23503') {
    // Foreign key - referenced record doesn't exist
    res.status(400).json({ error: 'Invalid tenant reference' });
  } else {
    res.status(500).json({ error: 'Database error' });
  }
}
```

## Performance Notes

### Connection Pool
- **Max connections**: 20 (configurable)
- **Idle timeout**: 30 seconds
- **Connection timeout**: 2 seconds

### Indexes
Strategic indexes on:
- Unique keys (tenants.slug)
- Foreign keys (all references)
- Frequently queried columns (status, severity, type)
- Time-based ranges (created_at, timestamp DESC)

### Query Optimization
- Always paginate large result sets
- Filter before pagination
- Use `count()` for pagination UI
- Consider denormalization for aggregations

### Future Optimizations
- Materialized views for incident/event aggregations
- Event table partitioning by date (high volume)
- Read replicas for reporting queries
- Redis caching for frequently accessed data

## Testing

### Run Unit Tests
```bash
npm test -- src/db/__tests__/repositories.test.ts
```

Tests use a MockPool so no real database is required. They verify:
- ✓ Creating and retrieving tenants
- ✓ Finding cameras by site with filters
- ✓ Acknowledging and escalating incidents
- ✓ Logging audit entries
- ✓ Pagination handling

### Integration Tests (Future)
```typescript
describe('CameraRepository Integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await runMigrations(pool);
  });

  it('should find cameras by site', async () => {
    const repo = new CameraRepository(pool);
    const result = await repo.findBySiteId(siteId, { limit: 10, offset: 0 });
    expect(result.data).toBeDefined();
  });
});
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://ainvr:ainvr_dev@localhost:5432/ainvr

# Optional (defaults shown)
DB_POOL_MAX=20
DB_CONNECTION_TIMEOUT_MS=2000
DB_IDLE_TIMEOUT_MS=30000

NODE_ENV=development|production
LOG_LEVEL=debug|info|warn|error
```

## Deployment Checklist

- [ ] Install pg and @types/pg dependencies
- [ ] Set DATABASE_URL environment variable
- [ ] Ensure PostgreSQL 16+ is running
- [ ] Run migrations during application startup
- [ ] Test repositories with real database
- [ ] Set up automated backups
- [ ] Configure connection pool for workload
- [ ] Enable PostgreSQL slow query logging
- [ ] Set up monitoring for connections
- [ ] Implement encryption for credentials
- [ ] Document disaster recovery procedures
- [ ] Test failover and recovery

## Next Steps

1. **Install dependencies**: `npm install pg @types/pg`
2. **Create .env file**: Copy from `.env.example`
3. **Integrate in application**: Use init.example.ts as reference
4. **Run migrations**: Call `initializePool()` and `runMigrations(pool)` at startup
5. **Create repositories**: Instantiate repository classes with pool
6. **Test thoroughly**: Run unit tests, then integration tests
7. **Monitor in production**: Set up logging and alerting

## Repository Structure

### TenantRepository
- `create(data)` - Create tenant
- `findById(id)` - Get tenant by ID
- `findBySlug(slug)` - Get tenant by unique slug
- `findAll(filters, pagination)` - List all tenants
- `update(id, data)` - Update tenant
- `delete(id)` - Delete tenant

### SiteRepository
- `findByTenantId(tenantId, pagination)` - List sites for tenant
- (plus inherited CRUD methods)

### CameraRepository
- `findBySiteId(siteId, pagination)` - List cameras for site
- `updateStatus(id, status)` - Update camera status
- (plus inherited CRUD methods)

### IncidentRepository
- `findByStatus(tenantId, status, pagination)` - Find by status
- `acknowledge(id, userId)` - Mark as acknowledged
- `escalate(id)` - Escalate severity
- `close(id)` - Close incident
- (plus inherited CRUD methods)

### AuditLogRepository
- `log(tenantId, userId, action, resourceType, resourceId?, details?, ip?)` - Log action
- `findByTenantId(tenantId, pagination)` - Tenant audit trail
- `findByUserId(userId, pagination)` - User action history
- `findByAction(action, pagination)` - Actions by type
- (plus inherited CRUD methods)

## Support & References

- PostgreSQL Docs: https://www.postgresql.org/docs/16/
- node-postgres (pg): https://node-postgres.com/
- TypeScript: https://www.typescriptlang.org/

See [apps/api/src/db/README.md](./apps/api/src/db/README.md) for complete technical documentation.
