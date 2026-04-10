# Database Layer Setup Summary

## Overview

Complete PostgreSQL database schema v1 and migration infrastructure has been created for the AI-NVR platform. The implementation uses node-postgres (pg) library for database access with full SQL injection prevention via parameterized queries.

## Files Created

### 1. Schema Migration
**Location**: `apps/api/src/db/migrations/001_initial_schema.sql`

Complete PostgreSQL migration including:
- 16 tables covering MVP requirements (tenants, sites, zones, cameras, streams, clips, events, incidents, policies, alert_routes, audit_logs, models, model_deployments, recordings, camera_credentials, incident_events)
- UUID primary keys with gen_random_uuid() defaults
- Comprehensive indexing for query performance
- PostgreSQL extensions: uuid-ossp, pgcrypto
- Triggers for automatic `updated_at` timestamp management
- CHECK constraints on enum-like columns
- Foreign key relationships with CASCADE delete rules
- JSONB columns for flexible data storage

### 2. Connection Pool Management
**Location**: `apps/api/src/db/pool.ts`

Database connection pool with:
- Singleton pool instance with lazy initialization
- Exponential backoff retry logic (5 attempts, 1-10 second delays)
- Connection timeout and idle timeout management
- Graceful shutdown hooks for SIGINT/SIGTERM
- Helper functions: `initializePool()`, `getPool()`, `query()`, `transaction()`
- Full TypeScript support

### 3. Migration Runner
**Location**: `apps/api/src/db/migrator.ts`

Migration management system with:
- Automatic `schema_migrations` table creation
- File-based migration discovery and ordering
- Idempotent migration tracking
- Rollback prevention (recommended for production use with node-pg-migrate)
- Status reporting showing applied vs pending migrations
- Transactional migration execution with ROLLBACK on error

### 4. Repository Layer

#### Base Repository
**Location**: `apps/api/src/db/repositories/base-repository.ts`

Generic CRUD base class with:
- `findById(id)` - Get single record
- `findAll(filters, pagination)` - List with optional filtering
- `create(data)` - Insert record
- `update(id, data)` - Update record
- `delete(id)` - Delete record
- `count(filters)` - Count matching records
- Built-in pagination support with limit/offset
- Type-safe generic implementation

#### Tenant Repository
**Location**: `apps/api/src/db/repositories/tenant-repository.ts`

Extends BaseRepository with:
- `findBySlug(slug)` - Get tenant by unique slug

#### Site Repository
**Location**: `apps/api/src/db/repositories/site-repository.ts`

Extends BaseRepository with:
- `findByTenantId(tenantId, pagination)` - List sites for a tenant

#### Camera Repository
**Location**: `apps/api/src/db/repositories/camera-repository.ts`

Extends BaseRepository with:
- `findBySiteId(siteId, pagination)` - List cameras for a site
- `updateStatus(id, status)` - Update camera online/offline status
- Type-safe enums for CameraStatus and CameraProtocol

#### Incident Repository
**Location**: `apps/api/src/db/repositories/incident-repository.ts`

Extends BaseRepository with:
- `findByStatus(tenantId, status, pagination)` - Find incidents by status
- `acknowledge(id, userId)` - Mark as acknowledged with timestamp
- `escalate(id)` - Escalate incident escalation_state
- `close(id)` - Close incident
- Type-safe enums for IncidentStatus, Severity, EscalationState

#### Audit Log Repository
**Location**: `apps/api/src/db/repositories/audit-log-repository.ts`

Extends BaseRepository with:
- `log(tenantId, userId, action, resourceType, resourceId?, details?, ipAddress?)` - Create audit entry
- `findByTenantId(tenantId, pagination)` - Tenant audit trail
- `findByUserId(userId, pagination)` - User action history
- `findByAction(action, pagination)` - Find actions by type

#### Repository Barrel Export
**Location**: `apps/api/src/db/repositories/index.ts`

Single import point for all repositories and types:
```typescript
import { TenantRepository, CameraRepository, type Tenant, type Camera } from './db/repositories';
```

### 5. Database Module Export
**Location**: `apps/api/src/db/index.ts`

Top-level barrel export for the entire database module:
```typescript
import { 
  initializePool, 
  TenantRepository,
  CameraRepository,
  runMigrations,
  type Tenant
} from './db';
```

### 6. Unit Tests
**Location**: `apps/api/src/db/__tests__/repositories.test.ts`

Comprehensive test suite with:
- MockPool class for testing without real database
- TenantRepository tests (create, findBySlug)
- CameraRepository tests (findBySiteId, updateStatus)
- IncidentRepository tests (acknowledge, findByStatus, escalate, close)
- AuditLogRepository tests (log, findByTenantId)
- Uses Vitest framework with mock-based approach

### 7. Documentation

#### Main README
**Location**: `apps/api/src/db/README.md`

Comprehensive documentation covering:
- Project structure overview
- Quick start guide
- Database configuration and connection pooling
- Complete schema documentation for all 16 tables
- Repository class reference
- Security features (SQL injection prevention, encryption, audit trail)
- Migration management
- Testing strategies
- Performance considerations
- Environment variables

#### Quick Reference Guide
**Location**: `apps/api/src/db/QUICK_REFERENCE.md`

Fast lookup guide with:
- Common operations (CRUD examples)
- Repository-specific methods
- Type imports
- Error handling patterns
- Pagination examples
- Performance tips
- Audit logging examples
- File structure
- Module exports

#### Dependencies Guide
**Location**: `apps/api/DEPENDENCIES.md`

Package installation guide:
- Production dependencies: pg, @types/pg
- Installation commands
- Rationale for technology choices

## Technology Stack

### Core
- **Database**: PostgreSQL 16
- **Driver**: node-postgres (pg) v8.11.0
- **TypeScript**: Full type safety
- **Testing**: Vitest with mock pool

### Key Features
- Parameterized queries (SQL injection safe)
- Connection pooling with retry logic
- Transactional support
- Automatic timestamp management
- Multi-tenant architecture
- Comprehensive audit logging
- Flexible JSONB storage for extensibility

## Security Highlights

1. **SQL Injection Prevention**: All queries use parameterized statements with positional placeholders
2. **Encryption-Ready**: Camera credentials stored as BYTEA for application-layer encryption
3. **Audit Trail**: All user actions logged with tenant isolation, user ID, timestamps, and IP addresses
4. **Tenant Isolation**: Every multi-tenant table includes tenant_id with foreign key constraints
5. **Referential Integrity**: Foreign key constraints enforce data consistency with CASCADE delete rules

## Getting Started

### 1. Install Dependencies
```bash
cd platform/apps/api
npm install pg @types/pg
```

### 2. Set Environment Variable
```bash
export DATABASE_URL=postgresql://ainvr:ainvr_dev@localhost:5432/ainvr
```

### 3. Initialize in Your Application
```typescript
import { initializePool, runMigrations } from './db';

async function main() {
  const pool = await initializePool();
  await runMigrations(pool);
  
  // Use repositories
  const tenantRepo = new TenantRepository(pool);
  const tenant = await tenantRepo.create({ name: 'Acme', slug: 'acme' });
}

main().catch(console.error);
```

### 4. Run Tests
```bash
npm test -- src/db/__tests__/repositories.test.ts
```

## Schema Summary

### Tables Created: 16

1. **tenants** - Multi-tenant isolation
2. **sites** - Physical locations
3. **zones** - Restricted areas
4. **cameras** - Video sources
5. **camera_credentials** - Encrypted camera auth
6. **streams** - Individual camera streams
7. **recordings** - Continuous video recordings
8. **clips** - Extracted video segments
9. **events** - Detection/system events
10. **incidents** - Aggregated security incidents
11. **incident_events** - Event-to-incident junction table
12. **policies** - Detection/alert rules
13. **alert_routes** - Policy notification channels
14. **models** - ML/AI detection models
15. **model_deployments** - Model instances on workers
16. **audit_logs** - User action tracking

### Indexes: 18+

Strategic indexes on:
- Unique keys (tenants.slug)
- Foreign keys (tenant_id, site_id, camera_id, policy_id)
- Frequently queried columns (status, severity, type)
- Time-based ranges (created_at, timestamp)
- Multi-column indexes for common queries

## Performance Notes

- Connection pool defaults to 20 max connections
- Idle connections reclaimed after 30 seconds
- Event table recommended for partitioning in high-volume deployments
- Materialized views for incident/event aggregations (future)
- Consider Redis caching for frequently accessed data

## Next Steps

1. Create `apps/api/src/db/index.ts` barrel export (DONE)
2. Update `apps/api/package.json` with pg dependencies
3. Create API route handlers using repositories
4. Implement application-layer encryption for credentials
5. Add role-based access control (RBAC) checks
6. Create database backup/restore procedures
7. Add production monitoring (slow query logs, connection pool metrics)
8. Implement read replicas for reporting queries (future scaling)

## File Tree

```
platform/
├── apps/api/
│   ├── src/db/
│   │   ├── migrations/
│   │   │   └── 001_initial_schema.sql
│   │   ├── repositories/
│   │   │   ├── base-repository.ts
│   │   │   ├── tenant-repository.ts
│   │   │   ├── site-repository.ts
│   │   │   ├── camera-repository.ts
│   │   │   ├── incident-repository.ts
│   │   │   ├── audit-log-repository.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   │   └── repositories.test.ts
│   │   ├── index.ts
│   │   ├── pool.ts
│   │   ├── migrator.ts
│   │   ├── README.md
│   │   └── QUICK_REFERENCE.md
│   └── DEPENDENCIES.md
└── DB_SETUP_SUMMARY.md (this file)
```

## Compatibility Notes

- PostgreSQL 16+
- Node.js 18+
- TypeScript 5+
- Docker (for development database)

## Support

Refer to:
- `apps/api/src/db/README.md` - Complete documentation
- `apps/api/src/db/QUICK_REFERENCE.md` - Common patterns
- `apps/api/src/db/__tests__/repositories.test.ts` - Usage examples
- pg library docs: https://node-postgres.com/
