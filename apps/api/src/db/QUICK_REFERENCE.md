# Database Layer Quick Reference

## Initialization

```typescript
// In your app startup (main.ts or server.ts)
import { initializePool } from './db/pool';
import { runMigrations } from './db/migrator';

const pool = await initializePool();
await runMigrations(pool);
```

## Using Repositories

```typescript
import { 
  getPool,
  TenantRepository,
  CameraRepository,
  SiteRepository,
  IncidentRepository,
  AuditLogRepository
} from './db';

const pool = getPool();
const tenantRepo = new TenantRepository(pool);
const cameraRepo = new CameraRepository(pool);
// ... etc
```

## Common Operations

### Create

```typescript
const tenant = await tenantRepo.create({
  name: 'Acme Corp',
  slug: 'acme-corp'
});
```

### Read by ID

```typescript
const tenant = await tenantRepo.findById(tenantId);
if (!tenant) {
  // Handle not found
}
```

### Read All with Pagination

```typescript
const result = await cameraRepo.findBySiteId(siteId, {
  limit: 25,
  offset: 0
});

// result.data contains cameras
// result.total is total count
// Use offset+limit for pagination UI
```

### Update

```typescript
const updated = await cameraRepo.updateStatus(cameraId, 'offline');
```

### Delete

```typescript
const deleted = await tenantRepo.delete(tenantId);
if (deleted) {
  // Success
}
```

### Search/Filter

```typescript
// Find all incidents with status "open"
const result = await incidentRepo.findByStatus(tenantId, 'open', {
  limit: 50,
  offset: 0
});
```

## Repository-Specific Methods

### TenantRepository
- `findBySlug(slug)` - Get tenant by slug

### SiteRepository
- `findByTenantId(tenantId, pagination)` - List sites for tenant

### CameraRepository
- `findBySiteId(siteId, pagination)` - List cameras for site
- `updateStatus(id, status)` - Update camera status

### IncidentRepository
- `findByStatus(tenantId, status, pagination)` - Find by status
- `acknowledge(id, userId)` - Mark as acknowledged
- `escalate(id)` - Escalate incident
- `close(id)` - Close incident

### AuditLogRepository
- `log(tenantId, userId, action, resourceType, resourceId?, details?, ipAddress?)` - Log action
- `findByTenantId(tenantId, pagination)` - Tenant's audit trail
- `findByUserId(userId, pagination)` - User's actions
- `findByAction(action, pagination)` - Actions by type

## Database Access Directly

```typescript
import { query, transaction } from './db/pool';

// Raw query
const results = await query('SELECT * FROM cameras WHERE site_id = $1', [siteId]);

// Transaction
await transaction(async (client) => {
  await client.query('UPDATE cameras SET status = $1', ['offline']);
  await client.query('INSERT INTO audit_logs ...');
});
```

## Common Filters

```typescript
// BaseRepository.findAll() supports filters
const result = await cameraRepo.findAll(
  { site_id: siteId, status: 'online' },
  { limit: 10, offset: 0 }
);
```

## Type Imports

```typescript
import {
  Tenant,
  Site,
  Camera,
  CameraStatus,
  Incident,
  IncidentStatus,
  AuditLog,
  PaginatedResult,
  PaginationOptions
} from './db/repositories';
```

## Error Handling

```typescript
try {
  const tenant = await tenantRepo.create(data);
} catch (error) {
  if (error.code === '23505') {
    // Unique constraint violation (e.g., duplicate slug)
  } else if (error.code === '23503') {
    // Foreign key violation
  } else {
    // Other database error
  }
}
```

## Pagination Pattern

```typescript
const pageSize = 25;
const pageNum = 1; // User requests page 1 (0-indexed: 0)

const result = await cameraRepo.findBySiteId(siteId, {
  limit: pageSize,
  offset: pageNum * pageSize
});

// In response
{
  data: result.data,
  pagination: {
    total: result.total,
    pageSize: result.limit,
    pageNum: Math.floor(result.offset / result.limit),
    hasMore: result.offset + result.limit < result.total
  }
}
```

## Connection Status

```typescript
import { getPool } from './db/pool';

const pool = getPool();
const client = await pool.connect();
try {
  await client.query('SELECT NOW()');
  console.log('Database connected');
} finally {
  client.release();
}
```

## Performance Tips

1. **Always paginate** - Don't fetch all records at once
   ```typescript
   await repo.findAll({}, { limit: 100, offset: 0 });
   ```

2. **Filter before pagination** - Use filters to reduce result set
   ```typescript
   await cameraRepo.findBySiteId(siteId, { limit: 10, offset: 0 });
   // Not: findAll({}, ...) then filter in app
   ```

3. **Use specific queries** - Don't load full objects if you only need IDs
   ```typescript
   // Future: implement findIdsBy() methods
   ```

4. **Batch operations with transactions**
   ```typescript
   await transaction(async (client) => {
     await client.query('INSERT INTO incidents ...');
     await client.query('INSERT INTO incident_events ...');
   });
   ```

## Audit Logging

```typescript
const auditRepo = new AuditLogRepository(pool);

await auditRepo.log(
  tenantId,
  userId,
  'CREATE',           // Action
  'CAMERA',           // Resource type
  cameraId,           // Resource ID
  { name: 'Front Door' }, // Details
  req.ip              // IP address
);
```

## Migration Workflow

```typescript
import { runMigrations, getMigrationStatus } from './db/migrator';

// Check status
await getMigrationStatus(pool);

// Apply pending
await runMigrations(pool);

// In production: ALWAYS backup before running
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://ainvr:ainvr_dev@localhost:5432/ainvr

# Optional (defaults shown)
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=2000
```

## File Structure

```
src/db/
├── migrations/              # SQL migration files
│   └── 001_initial_schema.sql
├── repositories/            # Data access layer
│   ├── base-repository.ts
│   ├── tenant-repository.ts
│   ├── camera-repository.ts
│   └── ... (other repos)
├── __tests__/               # Unit tests
├── pool.ts                  # Connection pool
├── migrator.ts              # Migration runner
└── README.md                # Full documentation
```

## Module Exports

```typescript
// From db/index.ts (future - create this)
export { initializePool, getPool, query, transaction } from './pool';
export { runMigrations, getMigrationStatus } from './migrator';
export {
  TenantRepository,
  SiteRepository,
  CameraRepository,
  IncidentRepository,
  AuditLogRepository,
  BaseRepository,
  type Tenant,
  type Site,
  type Camera,
  // ... all types
} from './repositories';
```

Create the index.ts file at `apps/api/src/db/index.ts` to barrel export everything.
