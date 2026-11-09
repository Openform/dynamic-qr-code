#!/usr/bin/env node
/**
 * Call one function from a copy of src/lib/db.js, in a process of its own.
 * Used by check-migrations.mjs.
 *
 *   node scripts/ci/db-call.cjs <path to db.js> <function> [args...]
 *
 * ensureSchema() caches its result for the life of a process, so every run
 * has to start a new one, just as each Hostinger deploy or restart does. The
 * result is printed as JSON on the last line of stdout. The connection pool
 * is always closed, so the process exits, and any error exits non-zero.
 *
 * Arguments made only of digits are passed as numbers, the rest as strings.
 */

const path = require('node:path');

const [dbFile, fn, ...rawArgs] = process.argv.slice(2);

async function main() {
  if (!dbFile || !fn) {
    throw new Error('Usage: node scripts/ci/db-call.cjs <path to db.js> <function> [args...]');
  }
  const db = require(path.resolve(dbFile));
  try {
    if (typeof db[fn] !== 'function') {
      throw new Error(`${dbFile} has no exported function "${fn}"`);
    }
    const args = rawArgs.map((arg) => (/^\d+$/.test(arg) ? Number(arg) : arg));
    const result = await db[fn](...args);
    process.stdout.write(`${JSON.stringify({ result: result ?? null })}\n`);
  } finally {
    await db.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
