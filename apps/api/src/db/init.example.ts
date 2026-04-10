/**
 * Example: Database Initialization
 *
 * This file shows how to initialize the database layer in your application.
 * Copy this pattern into your main application file (e.g., src/main.ts or src/server.ts).
 */

import { initializePool, runMigrations, getMigrationStatus } from './index';
import { Pool } from 'pg';

/**
 * Initialize the database for the application
 */
export async function initializeDatabase(): Promise<Pool> {
  try {
    console.log('Initializing database connection...');
    const pool = await initializePool();
    console.log('Database connection pool established');

    // Run migrations
    console.log('Running database migrations...');
    await runMigrations(pool);
    console.log('Migrations completed successfully');

    // Optionally show migration status
    if (process.env.NODE_ENV === 'development') {
      console.log('Migration status:');
      await getMigrationStatus(pool);
    }

    return pool;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

/**
 * Example usage in main application
 */
export async function main(): Promise<{
  pool: Pool;
  tenantRepo: unknown;
  cameraRepo: unknown;
  incidentRepo: unknown;
  auditLogRepo: unknown;
}> {
  // Initialize database
  const pool = await initializeDatabase();

  // Now use repositories throughout your application
  const {
    TenantRepository,
    CameraRepository,
    IncidentRepository,
    AuditLogRepository,
  } = await import('./index');

  // Create repository instances
  const tenantRepo = new TenantRepository(pool);
  const cameraRepo = new CameraRepository(pool);
  const incidentRepo = new IncidentRepository(pool);
  const auditLogRepo = new AuditLogRepository(pool);

  // Example: Create a tenant
  console.log('\n--- Example Operations ---');

  const tenant = await tenantRepo.create({
    name: 'Example Tenant',
    slug: 'example-tenant',
  });
  console.log('Created tenant:', tenant.id);

  // Example: Find tenant by slug
  const foundTenant = await tenantRepo.findBySlug('example-tenant');
  console.log('Found tenant:', foundTenant?.name);

  // Example: List tenants with pagination
  const tenants = await tenantRepo.findAll(
    {},
    { limit: 10, offset: 0 }
  );
  console.log(`Found ${tenants.total} total tenants`);

  // Example: Log audit event
  const auditLog = await auditLogRepo.log(
    tenant.id,
    'system-user',
    'CREATE',
    'TENANT',
    tenant.id,
    { reason: 'Initial setup' },
    '127.0.0.1'
  );
  console.log('Created audit log:', auditLog.id);

  // Start your Express/Fastify/other server here
  // Express example:
  // const app = express();
  // app.locals.pool = pool;
  // app.listen(3000, () => console.log('Server running on port 3000'));

  // Make pool accessible globally or pass to route handlers
  return { pool, tenantRepo, cameraRepo, incidentRepo, auditLogRepo };
}

/**
 * Example: Integration with Express
 */
export function setupExpressDatabase(app: any): void {
  // Middleware to attach pool to requests
  app.use(async (req: any, res: any, next: any) => {
    try {
      const pool = await initializeDatabase();

      // Attach repositories to request context
      req.db = {
        pool,
        repositories: {
          tenant: new (await import('./index')).TenantRepository(pool),
          camera: new (await import('./index')).CameraRepository(pool),
          incident: new (await import('./index')).IncidentRepository(pool),
          auditLog: new (await import('./index')).AuditLogRepository(pool),
        },
      };

      next();
    } catch (error) {
      console.error('Database initialization error:', error);
      res.status(500).json({ error: 'Database initialization failed' });
    }
  });
}

/**
 * Example: Usage in route handler
 */
export async function exampleRouteHandler(req: any, res: any): Promise<void> {
  try {
    const { tenantId } = req.params;
    const { camera } = req.db.repositories;

    const cameras = await camera.findBySiteId(tenantId, {
      limit: 20,
      offset: 0,
    });

    res.json({
      data: cameras.data,
      pagination: {
        total: cameras.total,
        limit: cameras.limit,
        offset: cameras.offset,
      },
    });
  } catch (error) {
    console.error('Route error:', error);
    res.status(500).json({ error: 'Failed to fetch cameras' });
  }
}

/**
 * Example: Transaction usage
 */
export async function exampleTransaction(_pool: Pool): Promise<void> {
  const { transaction } = await import('./index');

  try {
    const result = await transaction(async (client) => {
      // Multiple operations in a transaction
      const insertResult = await client.query(
        'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
        ['New Tenant', 'new-tenant']
      );

      const tenantId = insertResult.rows[0].id;

      await client.query(
        'INSERT INTO sites (tenant_id, name, timezone) VALUES ($1, $2, $3)',
        [tenantId, 'Main Office', 'America/New_York']
      );

      return tenantId;
    });

    console.log('Transaction committed, new tenant ID:', result);
  } catch (error) {
    console.error('Transaction failed and rolled back:', error);
  }
}

/**
 * Example: Error handling
 */
export async function exampleErrorHandling(
  tenantRepo: any
): Promise<void> {
  try {
    await tenantRepo.create({
      name: 'Test',
      slug: 'test', // If this slug already exists, will get unique constraint error
    });
  } catch (error: any) {
    if (error.code === '23505') {
      console.error('Duplicate slug - choose a different one');
    } else if (error.code === '23503') {
      console.error('Foreign key constraint violation');
    } else {
      console.error('Database error:', error.message);
    }
  }
}

// PostgreSQL error codes
/*
23505 - unique_violation (duplicate key)
23503 - foreign_key_violation
23502 - not_null_violation
23514 - check_violation
P0001 - raise_exception
*/

// Export for use in other modules
export default { initializeDatabase, main };
