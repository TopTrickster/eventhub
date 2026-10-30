import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listMigrationFiles, runMigrations } from '../../src/data/migrator.js';
import { MIGRATIONS_DIR } from '../../src/services/index.js';
import { DEMO_IDS, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

describe('schema and migrations', () => {
  it('AC-1 creates entities and M:N foreign keys', async () => {
    const { rows: tables } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(['users', 'clubs', 'events', 'registrations', 'oauth_accounts', 'sessions']),
    );

    // registrations is the many-to-many: one foreign key to users, one to events (cascading).
    const { rows: keys } = await pool.query(`
      SELECT kcu.column_name, ccu.table_name AS references_table, rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
       WHERE kcu.table_name = 'registrations'
       ORDER BY kcu.column_name`);
    expect(keys).toEqual([
      { column_name: 'event_id', references_table: 'events', delete_rule: 'CASCADE' },
      { column_name: 'user_id', references_table: 'users', delete_rule: 'NO ACTION' },
    ]);

    // The keys are enforced: a registration for a user who does not exist is refused...
    await expect(
      pool.query('INSERT INTO registrations (event_id, user_id) VALUES ($1, gen_random_uuid())', [DEMO_IDS.eventCleanup]),
    ).rejects.toMatchObject({ code: '23503' });

    // ...and a real one links an existing user and an existing event.
    const { rows } = await pool.query(
      `INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) RETURNING event_id, user_id`,
      [DEMO_IDS.eventCleanup, DEMO_IDS.student2],
    );
    expect(rows[0]).toEqual({ event_id: DEMO_IDS.eventCleanup, user_id: DEMO_IDS.student2 });
  });

  it('records each numbered migration once and does not re-run it', async () => {
    const files = await listMigrationFiles(MIGRATIONS_DIR);
    expect(files).toEqual([
      '001_create_users_and_auth.sql',
      '002_create_clubs_and_events.sql',
      '003_create_registrations.sql',
      '004_add_indexes.sql',
    ]);
    expect(await runMigrations(pool, MIGRATIONS_DIR)).toEqual([]);
    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual(files);
  });

  it('rolls back a migration that fails and reports which one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eventhub-migrations-'));
    writeFileSync(join(dir, '999_broken.sql'), 'CREATE TABLE half_done (id int); THIS IS NOT SQL;');
    writeFileSync(join(dir, 'notes.txt'), 'not a migration');
    await expect(runMigrations(pool, dir)).rejects.toThrow('Migration 999_broken.sql failed');
    const { rows } = await pool.query("SELECT to_regclass('public.half_done') AS t");
    expect(rows[0].t).toBeNull();
  });

  it('rejects rows that break the constraints even without the service layer', async () => {
    await expect(
      pool.query('UPDATE events SET capacity = 0 WHERE id = $1', [DEMO_IDS.eventCleanup]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('INSERT INTO registrations (event_id, user_id) VALUES ($1, $2)', [DEMO_IDS.eventGames, DEMO_IDS.student1]),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
