// npm run db:migrate: applies every migrations/NNN_*.sql that has not run yet.
import { loadConfig, loadDotEnv } from '../src/config/env.js';
import { createPool } from '../src/data/db.js';
import { runMigrations } from '../src/data/migrator.js';
import { MIGRATIONS_DIR } from '../src/services/index.js';

loadDotEnv();
const pool = createPool(loadConfig().databaseUrl);
try {
  const applied = await runMigrations(pool, MIGRATIONS_DIR);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply: the schema is up to date.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
