#!/usr/bin/env node
/**
 * Database migration check, run by CI (.github/workflows/ci.yml).
 *
 * Production's database is changed by the app itself: on the first request
 * after each deploy, ensureSchema() in src/lib/db.js creates missing tables
 * and adds missing columns. This script runs that setup against a throwaway
 * database and fails if it would lose or change existing data.
 *
 *   1. Fresh install: ensureSchema() on an empty database creates every
 *      table, and running it again changes nothing.
 *   2. Upgrade from main: main's code builds the schema, sample rows are added
 *      (seed-data.mjs), then this checkout's ensureSchema() runs. No table,
 *      column or row may disappear and no value may change. A second run (an
 *      app restart) must change nothing. Then pruneScanEvents(), the app's
 *      only automatic delete, must remove exactly the sample scans dated
 *      before the cutoff and nothing else.
 *   3. Upgrade from production: the same as 2, starting from production's own
 *      table structure in scripts/ci/prod-schema.sql. Skipped with a warning
 *      until that file exists (see "CI checks" in the README).
 *
 * Every ensureSchema() runs in a new process (db-call.cjs), because it caches
 * its result for the life of a process.
 *
 * Environment:
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD   the throwaway server
 *   MYSQL_DATABASE  must end in "_ci": it is dropped and recreated many times
 *   BASE_REF        the git ref scenario 2 starts from (default origin/main)
 *   CI_SQL_MODE     optional: production's @@sql_mode, applied with SET GLOBAL
 *
 * Only ever point this at a throwaway server. To run it locally:
 *   docker run -d --name qrgo-ci-db -e MARIADB_ROOT_PASSWORD=ci -p 3306:3306 mariadb:11.4
 *   MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci MYSQL_DATABASE=qrgo_ci node scripts/ci/check-migrations.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import mysql from 'mysql2/promise';
import { OLD_SCAN_IDS, PRUNE_CUTOFF, SEED } from './seed-data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DB_CALL = path.join(HERE, 'db-call.cjs');
const CHECKOUT_DB = path.join(ROOT, 'src/lib/db.js');
const PROD_SCHEMA = path.join(HERE, 'prod-schema.sql');
// Inside the checkout, so main's copy of db.js finds this checkout's node_modules.
const BASE_DIR = path.join(ROOT, 'node_modules/.cache/check-migrations');
const BASE_REF = process.env.BASE_REF || 'origin/main';
const IN_GITHUB = process.env.GITHUB_ACTIONS === 'true';

const server = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

const failures = [];
let scenario = '';

// ──────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────

const annotation = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

function pass(message) {
  console.log(`  ✓ ${message}`);
}

function note(message) {
  console.log(`  · ${message}`);
}

function warn(message) {
  console.log(`  ! ${message}`);
  if (IN_GITHUB) console.log(`::warning title=Database migration check::${annotation(message)}`);
}

function fail(message) {
  failures.push(`${scenario}: ${message}`);
  console.log(`  ✗ ${message}`);
}

function preview(value) {
  if (value === null) return 'NULL';
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 40)}…" (${value.length} characters)` : text;
}

// ──────────────────────────────────────────────
// Database access
// ──────────────────────────────────────────────

const q = (name) => `\`${String(name).replace(/`/g, '``')}\``;

async function withConnection(work, { database = server.database, multipleStatements = false } = {}) {
  const conn = await mysql.createConnection({
    host: server.host,
    port: server.port,
    user: server.user,
    password: server.password,
    database,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements,
  });
  try {
    return await work(conn);
  } finally {
    await conn.end();
  }
}

async function resetDatabase() {
  await withConnection(
    async (conn) => {
      await conn.query(`DROP DATABASE IF EXISTS ${q(server.database)}`);
      await conn.query(`CREATE DATABASE ${q(server.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    },
    { database: undefined }
  );
}

/**
 * Run one db.js function in its own process and return its result. `what`
 * names the run in failure messages; the full error is printed to the log.
 */
function callDb(what, dbFile, fn, ...args) {
  const run = spawnSync(process.execPath, [DB_CALL, dbFile, fn, ...args.map(String)], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    const reason = run.error?.message ?? run.stderr.match(/^\w*Error: (.+)$/m)?.[1] ?? 'see the log above';
    throw new Error(`${what} failed: ${reason}`);
  }
  return JSON.parse(run.stdout.trim().split('\n').at(-1)).result;
}

/** Tables with their columns, indexes and foreign keys. */
async function readSchema(conn) {
  const [tables] = await conn.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );
  const schema = {};
  for (const { name } of tables) {
    schema[name] = { columnOrder: [], columns: {}, indexes: {}, foreignKeys: {} };
  }

  const [columns] = await conn.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, COLUMN_TYPE AS type,
            IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  for (const { tableName, name, ...column } of columns) {
    if (!schema[tableName]) continue;
    schema[tableName].columnOrder.push(name);
    schema[tableName].columns[name] = column;
  }

  const [indexColumns] = await conn.query(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`
  );
  for (const { tableName, name, nonUnique, columnName } of indexColumns) {
    if (!schema[tableName]) continue;
    const index = (schema[tableName].indexes[name] ??= { unique: Number(nonUnique) === 0, columns: [] });
    index.columns.push(columnName);
  }

  const [foreignKeys] = await conn.query(
    `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS referencedTable,
            UPDATE_RULE AS onUpdate, DELETE_RULE AS onDelete
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, CONSTRAINT_NAME`
  );
  for (const { tableName, name, ...foreignKey } of foreignKeys) {
    if (schema[tableName]) schema[tableName].foreignKeys[name] = foreignKey;
  }

  return schema;
}

const normalize = (value) =>
  value === null ? null : Buffer.isBuffer(value) ? `0x${value.toString('hex')}` : String(value);

/** Every row of every table, keyed by primary key, values as strings. */
async function readData(conn, schema) {
  const data = {};
  for (const [table, { columnOrder, indexes }] of Object.entries(schema)) {
    const key = indexes.PRIMARY?.columns ?? columnOrder;
    const [rows] = await conn.query(
      `SELECT ${columnOrder.map(q).join(', ')} FROM ${q(table)} ORDER BY ${key.map(q).join(', ')}`
    );
    const byKey = new Map();
    for (const row of rows) {
      const values = Object.fromEntries(columnOrder.map((column) => [column, normalize(row[column])]));
      byKey.set(key.map((column) => values[column]).join(', '), values);
    }
    data[table] = byKey;
  }
  return data;
}

async function snapshot() {
  return withConnection(async (conn) => {
    const schema = await readSchema(conn);
    return { schema, data: await readData(conn, schema) };
  });
}

/** Insert the sample rows, leaving out columns the schema doesn't have. */
async function seed(conn, schema) {
  let count = 0;
  for (const [table, rows] of Object.entries(SEED)) {
    const definition = schema[table];
    if (!definition) {
      note(`Not seeded: the starting schema has no ${table} table`);
      continue;
    }
    const missing = new Set();
    for (const row of rows) {
      const columns = Object.keys(row).filter((column) => {
        if (definition.columns[column]) return true;
        missing.add(column);
        return false;
      });
      await conn.query(`INSERT INTO ${q(table)} (${columns.map(q).join(', ')}) VALUES (?)`, [
        columns.map((column) => row[column]),
      ]);
      count += 1;
    }
    if (missing.size > 0) {
      note(`${table}: the starting schema has no ${[...missing].join(', ')} column, so it wasn't filled`);
    }
  }
  return count;
}

// ──────────────────────────────────────────────
// Comparisons
// ──────────────────────────────────────────────

/** Rows that disappeared and values that changed. Rows added are ignored here. */
function compareData(before, after) {
  const problems = [];
  for (const [table, rows] of Object.entries(before)) {
    const now = after[table];
    if (!now) {
      if (rows.size > 0) problems.push(`${table}: the table and its ${rows.size} rows are gone`);
      continue;
    }
    let gone = 0;
    const changed = new Map();
    for (const [key, values] of rows) {
      const current = now.get(key);
      if (!current) {
        gone += 1;
        continue;
      }
      for (const [column, value] of Object.entries(values)) {
        if (column in current && current[column] !== value && !changed.has(column)) {
          changed.set(column, `row ${key}: ${preview(value)} became ${preview(current[column])}`);
        }
      }
    }
    if (gone > 0) problems.push(`${table}: ${gone} of ${rows.size} rows are gone`);
    for (const [column, detail] of changed) problems.push(`${table}.${column} changed, ${detail}`);
  }
  return problems;
}

/** Removed tables and columns are problems; other structural losses are warnings. */
function compareSchema(before, after) {
  const problems = [];
  const warnings = [];
  for (const [table, definition] of Object.entries(before)) {
    const now = after[table];
    if (!now) {
      problems.push(`Table ${table} was removed`);
      continue;
    }
    for (const [name, column] of Object.entries(definition.columns)) {
      const current = now.columns[name];
      if (!current) {
        problems.push(`Column ${table}.${name} was removed`);
      } else if (current.type !== column.type || current.nullable !== column.nullable) {
        const describe = (c) => `${c.type}${c.nullable === 'NO' ? ' NOT NULL' : ''}`;
        warnings.push(
          `Column ${table}.${name} changed from ${describe(column)} to ${describe(current)}. Check that it only widens.`
        );
      }
    }
    for (const name of Object.keys(definition.indexes)) {
      if (!now.indexes[name]) warnings.push(`Index ${name} on ${table} was removed`);
    }
    for (const name of Object.keys(definition.foreignKeys)) {
      if (!now.foreignKeys[name]) warnings.push(`Foreign key ${name} on ${table} was removed`);
    }
  }
  return { problems, warnings };
}

/** A second ensureSchema() run must leave structure and data exactly as they were. */
function checkUnchanged(first, second, what) {
  const problems = [];
  const tables = new Set([...Object.keys(first.schema), ...Object.keys(second.schema)]);
  for (const table of tables) {
    if (!isDeepStrictEqual(first.schema[table], second.schema[table])) {
      problems.push(`the structure of ${table} changed`);
    }
    const added = (second.data[table]?.size ?? 0) - (first.data[table]?.size ?? 0);
    if (added > 0) problems.push(`${added} rows were added to ${table}`);
  }
  problems.push(...compareData(first.data, second.data));
  if (problems.length === 0) {
    pass(`${what} changed nothing`);
  } else {
    for (const problem of problems) fail(`${what} wasn't a no-op: ${problem}`);
  }
}

function reportAddedRows(before, after) {
  for (const [table, rows] of Object.entries(after)) {
    const added = rows.size - (before[table]?.size ?? 0);
    if (added > 0) note(`ensureSchema() added ${added} rows to ${table}`);
  }
}

// ──────────────────────────────────────────────
// Scenarios
// ──────────────────────────────────────────────

async function checkFreshInstall() {
  await resetDatabase();
  callDb('ensureSchema() on an empty database', CHECKOUT_DB, 'ensureSchema');
  const first = await snapshot();
  const missing = Object.keys(SEED).filter((table) => !first.schema[table]);
  if (missing.length > 0) {
    fail(`ensureSchema() didn't create ${missing.join(', ')}`);
  } else {
    pass(`ensureSchema() created all ${Object.keys(first.schema).length} tables`);
  }
  callDb('A second ensureSchema() run', CHECKOUT_DB, 'ensureSchema');
  checkUnchanged(first, await snapshot(), 'A second ensureSchema() run');
}

async function checkUpgrade(buildStartingSchema, { checkPrune = false } = {}) {
  await resetDatabase();
  await buildStartingSchema();
  const start = await withConnection(async (conn) => {
    const schema = await readSchema(conn);
    const seeded = await seed(conn, schema);
    return { schema, seeded, data: await readData(conn, schema) };
  });
  note(`Starting schema: ${Object.keys(start.schema).length} tables, ${start.seeded} sample rows added`);

  callDb('ensureSchema() on the starting schema', CHECKOUT_DB, 'ensureSchema');
  const upgraded = await snapshot();
  const { problems, warnings } = compareSchema(start.schema, upgraded.schema);
  problems.push(...compareData(start.data, upgraded.data));
  warnings.forEach(warn);
  if (problems.length === 0) {
    pass('ensureSchema() kept every table, column, row and value');
  } else {
    problems.forEach(fail);
  }
  reportAddedRows(start.data, upgraded.data);

  callDb('A second ensureSchema() run (an app restart)', CHECKOUT_DB, 'ensureSchema');
  const restarted = await snapshot();
  checkUnchanged(upgraded, restarted, 'A second ensureSchema() run (an app restart)');

  if (checkPrune) await checkPruneScanEvents(restarted);
}

async function checkPruneScanEvents(before) {
  if (!before.data.scan_events) {
    fail('There is no scan_events table to prune');
    return;
  }
  const expectedGone = new Set(OLD_SCAN_IDS.map(String));
  // Batches of 2 make the delete loop run more than once.
  const deleted = callDb('pruneScanEvents()', CHECKOUT_DB, 'pruneScanEvents', PRUNE_CUTOFF, 2);
  const after = await snapshot();

  const problems = [];
  if (deleted !== expectedGone.size) {
    problems.push(`it reported ${deleted} rows deleted, expected ${expectedGone.size}`);
  }
  const kept = new Map();
  for (const [key, row] of before.data.scan_events) {
    const isGone = !after.data.scan_events?.has(key);
    if (expectedGone.has(key)) {
      if (!isGone) problems.push(`scan ${key} (${row.scanned_at}) is before ${PRUNE_CUTOFF} but wasn't deleted`);
    } else if (isGone) {
      problems.push(`scan ${key} (${row.scanned_at}) was deleted, but it isn't before ${PRUNE_CUTOFF}`);
    } else {
      kept.set(key, row);
    }
  }
  const { scan_events: _scans, ...otherTables } = before.data;
  problems.push(...compareData({ ...otherTables, scan_events: kept }, after.data));

  if (problems.length === 0) {
    pass(`pruneScanEvents() deleted exactly the ${deleted} scans before ${PRUNE_CUTOFF} and changed nothing else`);
  } else {
    for (const problem of problems) fail(`pruneScanEvents(): ${problem}`);
  }
}

/** Extract main's src/lib so its ensureSchema() can build the starting schema. */
function extractBaseCode() {
  let commit;
  try {
    commit = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${BASE_REF}^{commit}`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error(
      `Can't find ${BASE_REF}. In CI, check out with fetch-depth: 0. Locally, run: git fetch origin main`
    );
  }
  rmSync(BASE_DIR, { recursive: true, force: true });
  mkdirSync(BASE_DIR, { recursive: true });
  const archive = execFileSync('git', ['archive', commit, 'src/lib'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', BASE_DIR], { input: archive });
  return { commit, dbFile: path.join(BASE_DIR, 'src/lib/db.js') };
}

async function loadProductionStructure() {
  const sql = readFileSync(PROD_SCHEMA, 'utf8');
  if (/\bINSERT\s+INTO\b/i.test(sql)) {
    throw new Error(
      'prod-schema.sql contains INSERT statements. It must hold the table structure only, because the repo is ' +
        'public: remove the file from the repo and export it again with "Structure" only.'
    );
  }
  if (/^\s*(USE|CREATE\s+DATABASE)\b/im.test(sql)) {
    throw new Error(
      'prod-schema.sql selects or creates a database. Export it again without CREATE DATABASE or USE statements.'
    );
  }
  await withConnection((conn) => conn.query(sql), { multipleStatements: true });
}

async function runScenario(title, work) {
  scenario = title;
  console.log(`\n${title}`);
  try {
    await work();
  } catch (error) {
    fail(error.message);
  }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  if (!server.user || !server.database) {
    throw new Error('Set MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE (see the top of this file).');
  }
  if (!/^\w+_ci$/.test(server.database)) {
    throw new Error(
      `Refusing to run: MYSQL_DATABASE is "${server.database}". This script drops and recreates the database, ` +
        'so its name must end in "_ci". Only ever run it against a throwaway server.'
    );
  }

  await withConnection(
    async (conn) => {
      if (process.env.CI_SQL_MODE) {
        await conn.query('SET GLOBAL sql_mode = ?', [process.env.CI_SQL_MODE]);
      }
      const [[info]] = await conn.query('SELECT VERSION() AS version, @@GLOBAL.sql_mode AS sqlMode');
      console.log(`Database server ${info.version}`);
      console.log(`sql_mode: ${info.sqlMode || '(empty)'}`);
    },
    { database: undefined }
  );

  await runScenario('1. Fresh install', checkFreshInstall);

  await runScenario(`2. Upgrade from ${BASE_REF}`, async () => {
    const base = extractBaseCode();
    note(`Starting schema built by ${BASE_REF} (${base.commit.slice(0, 7)})`);
    await checkUpgrade(() => callDb(`${BASE_REF}'s ensureSchema()`, base.dbFile, 'ensureSchema'), { checkPrune: true });
  });

  if (existsSync(PROD_SCHEMA)) {
    await runScenario('3. Upgrade from production structure', () => checkUpgrade(loadProductionStructure));
  } else {
    scenario = '3. Upgrade from production structure';
    console.log(`\n${scenario}`);
    warn(
      "Skipped: scripts/ci/prod-schema.sql doesn't exist yet, so the check can't test production's own " +
        'table structure. See "CI checks" in the README.'
    );
  }

  console.log('');
  if (failures.length === 0) {
    console.log('Database migration check passed.');
    return;
  }
  console.log(`Database migration check failed (${failures.length}):`);
  for (const failure of failures) {
    console.log(`  - ${failure}`);
    if (IN_GITHUB) console.log(`::error title=Database migration check::${annotation(failure)}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
