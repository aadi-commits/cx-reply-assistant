import { Pool, PoolConfig } from 'pg';

/**
 * Database connection.
 *
 * A non-empty DATABASE_URL takes priority (recommended for hosted PostgreSQL
 * providers such as Supabase). If it is blank, local discrete variables are used:
 * PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, and PGSSL.
 *
 * URL-encode reserved characters in DATABASE_URL passwords. Discrete PGPASSWORD
 * values do not need URL encoding.
 */
function buildConfig(): PoolConfig {
  const base: PoolConfig = {
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: Number(process.env.PGPOOL_MAX || 10),
    // Supabase commonly installs extensions such as pgvector in `extensions`.
    // Including it in search_path also keeps vector operators/types resolvable.
    options: '-c search_path=public,extensions'
  };

  // DATABASE_URL MUST win over PGHOST/PGUSER/etc. The local .env template
  // contains PG* defaults, so checking those first would silently ignore a
  // configured Supabase URL during deployment.
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const explicitlyRequiresSsl = /^(1|true|require)$/i.test(process.env.PGSSL || '');
    const providerRequiresSsl = /supabase|render|neon|amazonaws|sslmode=require/i.test(url);
    return {
      ...base,
      connectionString: url,
      ssl: explicitlyRequiresSsl || providerRequiresSsl ? { rejectUnauthorized: false } : undefined
    };
  }

  const hasDiscrete = Boolean(process.env.PGPASSWORD || process.env.PGUSER || process.env.PGDATABASE || process.env.PGHOST);
  if (hasDiscrete) {
    const sslEnabled = /^(1|true|require)$/i.test(process.env.PGSSL || '');
    return {
      ...base,
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'postgres',
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
    };
  }

  throw new Error(
    'No database configuration found. Set DATABASE_URL (recommended for Supabase/hosted Postgres) or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.'
  );
}

export const pool = new Pool(buildConfig());

pool.on('error', (err: Error) => {
  // A client in the pool can error out asynchronously (e.g. network drop).
  // Log it so it never crashes the process silently.
  console.error('Unexpected PG pool error:', err.message);
});


let pgvectorAvailability: Promise<boolean> | null = null;

/** True only when the extension and the expected vector column are both present. */
export async function hasPgvector(): Promise<boolean> {
  if (!pgvectorAvailability) {
    pgvectorAvailability = pool
      .query(
        `SELECT
           EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
           AND EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'kb_entries'
                AND column_name = 'embedding' AND udt_name = 'vector'
           ) AS enabled`
      )
      .then(({ rows }) => Boolean(rows[0]?.enabled))
      .catch(() => false);
  }
  return pgvectorAvailability;
}
