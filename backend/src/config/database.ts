import { Pool, PoolConfig } from 'pg';

/**
 * Database connection.
 *
 * Two supported configuration styles (discrete vars take precedence):
 *
 * 1. Discrete vars (recommended for local dev — no URL-encoding needed,
 *    so passwords containing @ : / # etc. work as-is):
 *      PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSL
 *
 * 2. A single connection string (recommended for hosted providers like
 *    Supabase, which give you one URL):
 *      DATABASE_URL=postgresql://user:pass@host:5432/db
 *    NOTE: if your password has special characters, URL-encode them.
 */
function buildConfig(): PoolConfig {
  const hasDiscrete = Boolean(process.env.PGPASSWORD || process.env.PGUSER || process.env.PGDATABASE);

  const base: PoolConfig = {
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10
  };

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

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'No database configuration found. Set PGHOST/PGUSER/PGPASSWORD/PGDATABASE (recommended for local) or DATABASE_URL.'
    );
  }

  // Managed Postgres (Supabase, Render, etc.) generally requires SSL.
  const needsSsl = /supabase|render|neon|amazonaws|sslmode=require/i.test(url);
  return {
    ...base,
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined
  };
}

export const pool = new Pool(buildConfig());

pool.on('error', (err: Error) => {
  // A client in the pool can error out asynchronously (e.g. network drop).
  // Log it so it never crashes the process silently.
  console.error('Unexpected PG pool error:', err.message);
});
