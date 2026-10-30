// npm run db:seed: two organizers, two students, two clubs, three future events (one full).
// Safe to run again: it restores the demo rows instead of duplicating them.
// The demo password is a local test value. In production it must come from SEED_PASSWORD.
import { loadConfig, loadDotEnv } from '../src/config/env.js';
import { createPool, withTransaction } from '../src/data/db.js';
import { DEMO_USERS, seedDemoData } from '../src/data/seedRepo.js';
import { argon2Hasher } from '../src/services/passwords.js';

const LOCAL_DEMO_PASSWORD = 'eventhub-demo-2026';

loadDotEnv();
const config = loadConfig();
const password = process.env.SEED_PASSWORD || (config.isProduction ? '' : LOCAL_DEMO_PASSWORD);
if (password.length < 10) {
  console.error('Set SEED_PASSWORD (10+ characters). Production never uses the local demo password.');
  process.exit(1);
}

const pool = createPool(config.databaseUrl);
try {
  const passwordHash = await argon2Hasher.hash(password);
  await withTransaction(pool, (client) => seedDemoData(client, { passwordHash, now: new Date() }));
  console.log(`Seeded demo data. Accounts: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(', ')}`);
  if (!process.env.SEED_PASSWORD) console.log(`Local demo password: ${LOCAL_DEMO_PASSWORD}`);
} catch (error) {
  console.error(`Seed failed: ${error.message}. Did you run npm run db:migrate?`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
