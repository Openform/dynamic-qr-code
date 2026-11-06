#!/usr/bin/env node
/**
 * Runs the end-to-end suites, one after another, against a running app.
 *
 *   npm run e2e                     everything
 *   npm run e2e:api                 only the API suites (no browser needed)
 *   npm run e2e:browser             only the browser suites
 *   npm run e2e -- trash-api select-mode     only the named suites
 *   npm run e2e -- --list           list the suites
 *   npm run e2e -- --verbose        stream each suite's output (default: only failures)
 *   npm run e2e -- --strict         count skipped suites as failures
 *
 * A suite that can't run here (Playwright not installed, no admin account, no
 * schema-admin user) is reported as skipped, not failed. See e2e/README.md for
 * setup; start the app first (`npm run dev`, with the same .env.local).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Importing the harness loads .env.local and refuses unsafe targets before any suite starts.
import { config } from './lib/harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  { id: 'schema-migration', file: 'api/schema-migration.mjs', kind: 'api' },
  { id: 'bulk-create-api', file: 'api/bulk-create.mjs', kind: 'api' },
  { id: 'trash-surfaces', file: 'api/trash-surfaces.mjs', kind: 'api' },
  { id: 'trash-api', file: 'api/trash-api.mjs', kind: 'api' },
  { id: 'bulk-create-ui', file: 'browser/bulk-create.mjs', kind: 'browser' },
  { id: 'bulk-create-errors', file: 'browser/bulk-create-errors.mjs', kind: 'browser' },
  { id: 'select-mode', file: 'browser/select-mode.mjs', kind: 'browser' },
  { id: 'trash-view', file: 'browser/trash-view.mjs', kind: 'browser' },
  { id: 'collection-delete', file: 'browser/collection-delete.mjs', kind: 'browser' },
  { id: 'admin-dialog', file: 'browser/admin-dialog.mjs', kind: 'browser' },
];

const EXIT_SKIPPED = 3;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const named = args.filter((arg) => !arg.startsWith('--'));

if (flag('--list')) {
  for (const suite of SUITES) console.log(`${suite.id.padEnd(20)} ${suite.kind.padEnd(8)} e2e/${suite.file}`);
  process.exit(0);
}

const unknown = named.filter((name) => !SUITES.some((suite) => suite.id === name));
if (unknown.length > 0) {
  console.error(`Unknown suite${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Try --list.`);
  process.exit(2);
}

const selected = SUITES.filter((suite) => {
  if (named.length > 0) return named.includes(suite.id);
  if (flag('--api') && !flag('--browser')) return suite.kind === 'api';
  if (flag('--browser') && !flag('--api')) return suite.kind === 'browser';
  return true;
});

// Is there an app to test?
try {
  const res = await fetch(`${config.baseUrl}/login`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (error) {
  console.error(
    `\ne2e: nothing is answering at ${config.baseUrl} (${error.message}).\n` +
      `Start the app against the test database first, in another terminal:\n\n    npm run dev\n\n` +
      `It must read the same .env.local as this runner. See e2e/README.md.\n`
  );
  process.exit(2);
}

function runSuite(suite) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(here, suite.file)], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      if (flag('--verbose')) process.stdout.write(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => {
      const summary = /(\d+)\/(\d+) checks passed/.exec(output);
      const skipReason = /^SKIPPED: (.*)$/m.exec(output)?.[1];
      resolve({
        suite,
        output,
        seconds: Math.round((Date.now() - started) / 1000),
        status: code === 0 ? 'passed' : code === EXIT_SKIPPED ? 'skipped' : 'FAILED',
        checks: summary ? `${summary[1]}/${summary[2]}` : '',
        skipReason,
      });
    });
  });
}

console.log(`Running ${selected.length} suite${selected.length === 1 ? '' : 's'} against ${config.baseUrl} (database: ${config.db.database})\n`);

const results = [];
for (const suite of selected) {
  if (flag('--verbose')) console.log(`\n━━ ${suite.id} ━━`);
  const result = await runSuite(suite);
  results.push(result);
  const detail = result.status === 'skipped' ? result.skipReason : result.checks;
  console.log(`${result.status === 'passed' ? '✓' : result.status === 'skipped' ? '-' : '✗'} ${suite.id.padEnd(20)} ${result.status.padEnd(8)} ${String(detail ?? '').padEnd(10)} ${result.seconds}s`);
  if (result.status === 'FAILED' && !flag('--verbose')) {
    console.log(`\n${result.output.trim().split('\n').map((line) => `    ${line}`).join('\n')}\n`);
  }
}

const failed = results.filter((r) => r.status === 'FAILED');
const skipped = results.filter((r) => r.status === 'skipped');
console.log(
  `\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped` +
    (skipped.length > 0 ? ' (skipped suites did NOT run)' : '')
);
process.exit(failed.length > 0 || (flag('--strict') && skipped.length > 0) ? 1 : 0);
