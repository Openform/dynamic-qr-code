// The database schema: a fresh database gets the whole schema (including the Trash
// column), running it again changes nothing, and a database from before Trash existed
// is migrated in place with its existing codes left live.
//
// It creates and drops a scratch database, which needs a user allowed to do that, so
// it only runs when E2E_SCHEMA_ADMIN_USER (and _PASSWORD) are set; otherwise it is
// skipped. The app's own database user is never used for this.
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { check, config, finish, repoRoot, run, skip, stamp } from '../lib/harness.mjs';

run(async () => {
  const adminUser = process.env.E2E_SCHEMA_ADMIN_USER;
  const adminPassword = process.env.E2E_SCHEMA_ADMIN_PASSWORD ?? '';
  if (!adminUser) {
    skip('E2E_SCHEMA_ADMIN_USER is not set (a user that may create and drop a scratch database; see e2e/README.md)');
  }

  const scratchName = `e2e_schema_${stamp}`;
  const connect = (database) =>
    mysql.createConnection({
      host: config.db.host,
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: adminUser,
      password: adminPassword,
      database,
    });

  const server = await connect(undefined);
  await server.query(`CREATE DATABASE \`${scratchName}\` CHARACTER SET utf8mb4`);
  const scratch = await connect(scratchName);

  // Run the app's own schema setup against the scratch database. db.js reads its
  // connection settings when it is loaded, so this needs a fresh process each time.
  function ensureSchema() {
    const result = spawnSync(
      process.execPath,
      ['-e', "const db = require('./src/lib/db.js'); db.ensureSchema().then(() => db.pool.end()).catch((e) => { console.error(e); process.exit(1); });"],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, MYSQL_USER: adminUser, MYSQL_PASSWORD: adminPassword, MYSQL_DATABASE: scratchName },
      }
    );
    if (result.status !== 0) throw new Error(`ensureSchema failed: ${result.stderr}`);
  }

  async function trashColumn() {
    const [columns] = await scratch.query(
      `SELECT IS_NULLABLE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'qrcodes' AND COLUMN_NAME = 'deleted_at'`,
      [scratchName]
    );
    const [indexes] = await scratch.query(
      `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'qrcodes' AND INDEX_NAME = 'idx_qrcodes_user_deleted'`,
      [scratchName]
    );
    return { column: columns[0] ?? null, indexColumns: indexes[0]?.cols ?? null };
  }

  try {
    console.log('A fresh database');
    ensureSchema();
    const [tables] = await scratch.query('SHOW TABLES');
    const names = tables.map((row) => Object.values(row)[0]);
    check('every table is created', ['users', 'collections', 'qrcodes', 'scan_events', 'qrcode_destinations', 'legal_pages', 'invite_requests'].every((t) => names.includes(t)), names);
    let state = await trashColumn();
    check('qrcodes.deleted_at is a nullable DATETIME', state.column?.IS_NULLABLE === 'YES' && /^datetime/i.test(state.column?.COLUMN_TYPE), state.column);
    check('with an index on (user_id, deleted_at)', state.indexColumns === 'user_id,deleted_at', state.indexColumns);

    console.log('Running it again');
    ensureSchema();
    state = await trashColumn();
    check('changes nothing (still one column, one index)', state.column !== null && state.indexColumns === 'user_id,deleted_at');

    console.log('A database from before Trash existed');
    await scratch.query("INSERT INTO users (email, password_hash, name) VALUES ('old@example.com', 'x', 'Old')");
    await scratch.query("INSERT INTO qrcodes (short_id, user_id, title, destination_url) VALUES ('oldcode001', 1, 'Old code', 'https://old.example.com')");
    await scratch.query('ALTER TABLE qrcodes DROP INDEX idx_qrcodes_user_deleted, DROP COLUMN deleted_at');
    state = await trashColumn();
    check('(set-up) the column and index are gone', state.column === null && state.indexColumns === null);
    ensureSchema();
    state = await trashColumn();
    check('the migration adds the column back', state.column?.IS_NULLABLE === 'YES');
    check('and the index', state.indexColumns === 'user_id,deleted_at', state.indexColumns);
    const [codes] = await scratch.query("SELECT deleted_at IS NULL AS live FROM qrcodes WHERE short_id = 'oldcode001'");
    check('a code created before Trash is live, not trashed', codes[0]?.live === 1, codes);
  } finally {
    await scratch.end();
    await server.query(`DROP DATABASE IF EXISTS \`${scratchName}\``);
    await server.end();
  }
  finish();
});
