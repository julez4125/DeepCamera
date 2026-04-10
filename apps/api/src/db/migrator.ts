import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

interface Migration {
  name: string;
  content: string;
}

interface MigrationRecord {
  name: string;
  executed_at: string;
}

/**
 * Initialize the schema_migrations table if it doesn't exist
 */
async function initializeMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Read all migration files from the migrations directory
 */
function readMigrations(migrationsDir: string): Migration[] {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((file) => ({
    name: file,
    content: fs.readFileSync(path.join(migrationsDir, file), 'utf-8'),
  }));
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<MigrationRecord>(
    'SELECT name FROM schema_migrations ORDER BY executed_at'
  );
  return new Set(result.rows.map((row) => row.name));
}

/**
 * Apply a single migration
 */
async function applyMigration(pool: Pool, migration: Migration): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(migration.content);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
    await client.query('COMMIT');
    console.log(`Applied migration: ${migration.name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(pool: Pool, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir || path.join(__dirname, 'migrations');

  if (!fs.existsSync(dir)) {
    console.warn(`Migrations directory not found: ${dir}`);
    return;
  }

  await initializeMigrationsTable(pool);

  const migrations = readMigrations(dir);
  const appliedMigrations = await getAppliedMigrations(pool);

  const pendingMigrations = migrations.filter((m) => !appliedMigrations.has(m.name));

  if (pendingMigrations.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Found ${pendingMigrations.length} pending migration(s)`);

  for (const migration of pendingMigrations) {
    try {
      await applyMigration(pool, migration);
    } catch (error) {
      console.error(`Failed to apply migration ${migration.name}:`, error);
      throw error;
    }
  }

  console.log(`Successfully applied ${pendingMigrations.length} migration(s)`);
}

/**
 * Get migration status
 */
export async function getMigrationStatus(pool: Pool, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir || path.join(__dirname, 'migrations');

  await initializeMigrationsTable(pool);

  const migrations = readMigrations(dir);
  const appliedMigrations = await getAppliedMigrations(pool);

  console.log('\n=== Migration Status ===\n');

  if (migrations.length === 0) {
    console.log('No migrations found.');
    return;
  }

  for (const migration of migrations) {
    const status = appliedMigrations.has(migration.name) ? '✓ Applied' : '⏳ Pending';
    console.log(`${status} - ${migration.name}`);
  }

  const pendingCount = migrations.filter((m) => !appliedMigrations.has(m.name)).length;
  console.log(`\nTotal: ${migrations.length} migrations, ${appliedMigrations.size} applied, ${pendingCount} pending\n`);
}

/**
 * Rollback is not supported in this simple migrator
 * (For production, consider using a more robust solution like node-pg-migrate)
 */
export function rollback(): void {
  throw new Error('Rollback is not supported. Manual intervention required.');
}
