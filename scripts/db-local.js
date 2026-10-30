// npm run db:local: a real PostgreSQL for development, from the embedded-postgres package,
// so nothing has to be installed. Data lives in .pgdata/ (git-ignored) and survives
// restarts. It listens on localhost:5433, which is the default DATABASE_URL outside
// production. Stop it with Ctrl+C.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { LOCAL_DATABASE_URL } from '../src/config/env.js';

const url = new URL(LOCAL_DATABASE_URL);
const databaseName = url.pathname.slice(1);
const databaseDir = join(process.cwd(), '.pgdata');
const firstRun = !existsSync(join(databaseDir, 'PG_VERSION'));

/** Connects to the server's own "postgres" database; resolves to a client, or null if nobody answers. */
async function connectToServer() {
  const serverUrl = new URL(LOCAL_DATABASE_URL);
  serverUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: serverUrl.href, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

async function ensureDatabase(client) {
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (rows.length === 0) await client.query(`CREATE DATABASE ${databaseName}`);
  await client.end();
}

// A server left running (another terminal, or one that was not stopped with Ctrl+C) is fine to reuse.
const running = await connectToServer();
if (running) {
  await ensureDatabase(running);
  console.log(`PostgreSQL is already running: ${LOCAL_DATABASE_URL}`);
  console.log('Nothing to start. Keep using it, or stop the other one first.');
  process.exit(0);
}

// Postgres's own log is kept, so a failed start shows its real reason instead of nothing.
const log = [];
const server = new EmbeddedPostgres({
  databaseDir,
  user: url.username,
  password: url.password,
  port: Number(url.port),
  persistent: true,
  // Windows would otherwise pick WIN1252, which cannot store Cyrillic.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: (message) => log.push(String(message)),
  onError: (message) => log.push(String(message)),
});

try {
  if (firstRun) await server.initialise();
  await server.start();
  await ensureDatabase(await connectToServer());
} catch (error) {
  const output = log.join('\n').trim().split('\n').slice(-15).join('\n');
  console.error('PostgreSQL did not start. Its last messages:\n');
  console.error(output || error?.message || '(no output)');
  console.error('\nIf an earlier database was left running (e.g. a closed terminal), run: npm run db:stop');
  process.exit(1);
}

console.log(`PostgreSQL is running: ${LOCAL_DATABASE_URL}`);
console.log(firstRun ? 'New database. Next, in another terminal: npm run db:migrate, then npm run db:seed' : 'Existing data in .pgdata/.');
console.log('Leave this terminal open; Ctrl+C stops the database.');

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
