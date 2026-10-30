// Runs once before all tests. With DATABASE_URL_TEST set (CI service, Codespaces, Neon
// branch) it uses that database; otherwise it starts a throwaway PostgreSQL from the
// embedded-postgres package in a temp folder and deletes it afterwards. Either way the
// tests run against real PostgreSQL: real constraints, real transactions, real locks.
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createPool } from '../../src/data/db.js';
import { runMigrations } from '../../src/data/migrator.js';
import { MIGRATIONS_DIR } from '../../src/services/index.js';

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

export default async function setup(project) {
  let url = process.env.DATABASE_URL_TEST;
  let embedded;
  if (!url) {
    const port = await freePort();
    embedded = new EmbeddedPostgres({
      databaseDir: mkdtempSync(join(tmpdir(), 'eventhub-test-')),
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
    });
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase('eventhub_test');
    url = `postgres://postgres:postgres@localhost:${port}/eventhub_test`;
  }

  const pool = createPool(url);
  await runMigrations(pool, MIGRATIONS_DIR);
  await pool.end();
  project.provide('databaseUrl', url);

  return async () => {
    if (embedded) await embedded.stop();
  };
}
