import 'dotenv/config';
import { Client } from 'pg';

/**
 * Destructive reset for this application's tables only. It deliberately does
 * not drop Supabase-managed schemas such as auth, storage, realtime, or extensions.
 * Requires explicit confirmation from the batch file and DATABASE_URL.
 */
async function main(): Promise<void> {
  if (process.env.CONFIRM_SUPABASE_RESET !== 'YES_I_BACKED_UP_AND_WANT_TO_RESET') {
    throw new Error('Reset blocked. Run RESET_SUPABASE_AND_RESEED.bat and confirm the destructive action.');
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required. This reset is for Supabase only.');
  let parsed: URL;
  try { parsed = new URL(connectionString); } catch { throw new Error('DATABASE_URL is not a valid URL.'); }
  if (!/supabase\.(co|com)$/i.test(parsed.hostname) && !/pooler\.supabase\./i.test(parsed.hostname)) {
    throw new Error(`Safety stop: host "${parsed.hostname}" does not look like a Supabase host.`);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    options: '-c search_path=public,extensions'
  });
  await client.connect();
  try {
    const identity = await client.query(`SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS server`);
    console.log(`Connected to database "${identity.rows[0].db}" as "${identity.rows[0].usr}".`);
    await client.query('BEGIN');
    await client.query(`
      DROP TABLE IF EXISTS public.ai_reply_logs CASCADE;
      DROP TABLE IF EXISTS public.messages CASCADE;
      DROP TABLE IF EXISTS public.conversations CASCADE;
      DROP TABLE IF EXISTS public.agent_brands CASCADE;
      DROP TABLE IF EXISTS public.agents CASCADE;
      DROP TABLE IF EXISTS public.kb_entries CASCADE;
      DROP TABLE IF EXISTS public.customers CASCADE;
      DROP TABLE IF EXISTS public.brands CASCADE;
    `);
    await client.query('COMMIT');
    console.log('Dropped application-owned tables only. Supabase-managed schemas were not changed.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('\nSupabase reset was not completed:', (error as Error).message || error);
  process.exitCode = 1;
});
