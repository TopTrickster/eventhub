// Applies migrations/NNN_name.sql in order, each in its own transaction, and records
// the version in schema_migrations so it never runs twice. A migration that has run
// is never edited: the next change is the next number.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
// Any constant works; it only has to be the same for every process that migrates.
const LOCK_KEY = 427001;

export async function listMigrationFiles(dir) {
  const names = await readdir(dir);
  return names.filter((name) => FILE_PATTERN.test(name)).sort();
}

export async function runMigrations(pool, dir) {
  const client = await pool.connect();
  try {
    // Two instances starting at once must not both apply 003.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((row) => row.version));
    const applied = [];
    for (const file of await listMigrationFiles(dir)) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    client.release();
  }
}
