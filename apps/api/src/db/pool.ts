import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

/**
 * Initialize the database connection pool with retry logic for Docker startup
 */
export async function initializePool(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgresql://ainvr:ainvr_dev@localhost:5432/ainvr';

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Setup error handler
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  // Attempt to connect with exponential backoff retry
  await connectWithRetry(pool, 5, 1000);

  // Setup graceful shutdown
  setupShutdownHook(pool);

  return pool;
}

/**
 * Connect to the database with exponential backoff retry
 */
async function connectWithRetry(
  poolInstance: Pool,
  maxAttempts: number,
  initialDelayMs: number
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await poolInstance.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('Database connected successfully');
      return;
    } catch (error) {
      lastError = error as Error;
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `Database connection attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`,
        lastError.message
      );

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `Failed to connect to database after ${maxAttempts} attempts: ${lastError?.message}`
  );
}

/**
 * Get the current database pool instance
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializePool() first.');
  }
  return pool;
}

/**
 * Setup graceful shutdown hook
 */
function setupShutdownHook(poolInstance: Pool): void {
  const shutdown = async (): Promise<void> => {
    console.log('Closing database pool...');
    try {
      await poolInstance.end();
      console.log('Database pool closed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error closing database pool:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Execute a query directly on the pool
 */
export async function query<T = any>(
  text: string,
  values?: any[]
): Promise<T[]> {
  const poolInstance = getPool();
  const result = await poolInstance.query(text, values);
  return result.rows;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const poolInstance = getPool();
  const client = await poolInstance.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
