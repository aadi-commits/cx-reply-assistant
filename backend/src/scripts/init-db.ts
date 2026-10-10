import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, ClientConfig } from 'pg';

const databaseName = (process.env.PGDATABASE || 'cx_reply_assistant').trim();
const isUrlMode = Boolean(process.env.DATABASE_URL?.trim());

function sslConfig(): ClientConfig['ssl'] {
  const enabled = /^(1|true|require)$/i.test(process.env.PGSSL || '');
  if (enabled) return { rejectUnauthorized: false };
  if (process.env.DATABASE_URL && /supabase|render|neon|amazonaws|sslmode=require/i.test(process.env.DATABASE_URL)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function localClientConfig(database: string): ClientConfig {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database,
    ssl: sslConfig(),
    connectionTimeoutMillis: 10000,
    options: '-c search_path=public,extensions'
  };
}

function databaseDirectory(): string {
  return path.resolve(__dirname, '../../../database');
}

function readSql(filename: string): string {
  return fs.readFileSync(path.join(databaseDirectory(), filename), 'utf8');
}

async function ensureDatabase(): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
    throw new Error('PGDATABASE may contain only letters, numbers, and underscores, and cannot start with a number.');
  }

  const admin = new Client(localClientConfig('postgres'));
  await admin.connect();
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (found.rowCount === 0) {
      // Database name was validated above; PostgreSQL parameters cannot bind identifiers.
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created PostgreSQL database: ${databaseName}`);
    } else {
      console.log(`PostgreSQL database already exists: ${databaseName}`);
    }
  } finally {
    await admin.end();
  }
}

async function main(): Promise<void> {
  if (!isUrlMode) {
    await ensureDatabase();
  }

  const client = new Client(
    isUrlMode
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: sslConfig(),
          connectionTimeoutMillis: 10000,
          options: '-c search_path=public,extensions'
        }
      : localClientConfig(databaseName)
  );

  await client.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    let vectorExtensionAvailable = true;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (error) {
      vectorExtensionAvailable = false;
      console.warn('pgvector is not installed in this PostgreSQL instance. Continuing with keyword search.');
      console.warn(`Reason: ${(error as Error).message.split('\n')[0]}`);
    }

    // If this database was first initialized without pgvector, keep its JSONB fallback
    // even if the extension is installed at a later time. This avoids mismatched types.
    const existingColumn = await client.query(
      `SELECT udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kb_entries' AND column_name = 'embedding'`
    );
    if (existingColumn.rows[0] && existingColumn.rows[0].udt_name !== 'vector') {
      vectorExtensionAvailable = false;
    }

    let schema = readSql('schema.sql');
    let aiMigration = readSql(path.join('migrations', '001_ai_layer.sql'));

    if (!vectorExtensionAvailable) {
      schema = schema
        .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '')
        .replace(/embedding\s+VECTOR\(1536\)/i, 'embedding JSONB');
      aiMigration = aiMigration.replace(
        /CREATE INDEX IF NOT EXISTS idx_kb_entries_embedding_hnsw[\s\S]*?;\s*/i,
        '-- pgvector unavailable: HNSW index omitted; keyword retrieval remains enabled.\n'
      );
    }

    await client.query(schema);
    console.log('Applied database/schema.sql');
    await client.query(readSql('seed.sql'));
    console.log('Applied database/seed.sql');
    await client.query(aiMigration);
    console.log('Applied database/migrations/001_ai_layer.sql');
    await client.query(readSql(path.join('migrations', '002_auth.sql')));
    console.log('Applied database/migrations/002_auth.sql');
    await client.query(readSql(path.join('migrations', '003_supabase_security.sql')));
    console.log('Applied database/migrations/003_supabase_security.sql');

    const counts = await client.query(
      `SELECT
        (SELECT count(*)::int FROM brands) AS brands,
        (SELECT count(*)::int FROM customers) AS customers,
        (SELECT count(*)::int FROM conversations) AS conversations,
        (SELECT count(*)::int FROM kb_entries) AS knowledge_entries,
        (SELECT count(*)::int FROM agents) AS agents`
    );
    console.log('\nDatabase setup complete.');
    console.log(`Database: ${isUrlMode ? '(DATABASE_URL)' : databaseName}`);
    console.log(`pgvector: ${vectorExtensionAvailable ? 'enabled (semantic retrieval available when embeddings are configured)' : 'not available (keyword retrieval enabled)'}`);
    console.log('Seed data:', counts.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('\nDatabase setup failed.');
  console.error((error as Error).message || error);
  console.error('\nCheck backend/.env. For Supabase, set DATABASE_URL to the Session pooler URI from the project Connect dialog; for local PostgreSQL, verify PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE.');
  console.error('The PGPASSWORD value configures this app connection only; it does not change the password stored inside PostgreSQL.');
  process.exitCode = 1;
});
