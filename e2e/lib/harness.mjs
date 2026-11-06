/**
 * Shared plumbing for the end-to-end suites in e2e/.
 *
 * The suites drive a RUNNING app (UI and API) and read and write its database
 * directly, so this file is deliberately cautious about where it points:
 *
 *  - Configuration comes from the environment, and from the repo's .env.local
 *    (the same file `npm run dev` reads), so the suites talk to the same database
 *    as the server being tested.
 *  - It refuses to run against anything that doesn't look like a local test
 *    setup: a non-local server or database host, or a database whose name doesn't
 *    contain "test" or "e2e". Each override is an explicit environment variable.
 *
 * See e2e/README.md.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);

// ── Configuration ──────────────────────────────────────────────

/** Load KEY=VALUE lines from a dotenv-style file without overriding the environment. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnvFile(path.join(repoRoot, '.env.local'));

export const config = {
  baseUrl: (process.env.E2E_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  // What the server puts in short links (its BASE_URL), for checking redirectUrl.
  redirectBase: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  inviteCode: process.env.SIGNUP_INVITE_CODE || '',
  adminEmail: (process.env.ADMIN_EMAILS || '').split(',')[0].trim().toLowerCase() || null,
  password: 'Sup3r-secret-pw!',
  artifactsDir: process.env.E2E_ARTIFACTS || path.join(repoRoot, 'e2e', '.artifacts'),
  db: {
    host: process.env.MYSQL_HOST || 'localhost',
    database: process.env.MYSQL_DATABASE || '',
    user: process.env.MYSQL_USER || '',
  },
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function refuse(message) {
  console.error(`\ne2e: refusing to run.\n\n${message}\n`);
  process.exit(2);
}

// Run on import, so no suite can start without passing it.
(function assertSafeTarget() {
  const problems = [];
  const serverHost = new URL(config.baseUrl).hostname;
  const allowRemote = process.env.E2E_ALLOW_REMOTE === '1';

  if (!config.db.user || !config.db.database) {
    problems.push('MYSQL_USER and MYSQL_DATABASE are not set (put them in .env.local, as for `npm run dev`).');
  }
  if (!config.inviteCode) {
    problems.push('SIGNUP_INVITE_CODE is not set: the suites create accounts through the register API.');
  }
  if (!allowRemote && !LOCAL_HOSTS.has(serverHost)) {
    problems.push(`The server (${config.baseUrl}) is not local. These suites create accounts and codes; set E2E_ALLOW_REMOTE=1 only if that server is a throwaway one.`);
  }
  if (!allowRemote && !LOCAL_HOSTS.has(config.db.host)) {
    problems.push(`The database host (${config.db.host}) is not local. The suites write to the database directly; set E2E_ALLOW_REMOTE=1 only if it is a throwaway database.`);
  }
  if (process.env.E2E_ALLOW_ANY_DB !== '1' && !/test|e2e/i.test(config.db.database)) {
    problems.push(`The database name "${config.db.database}" doesn't contain "test" or "e2e". Use a dedicated test database (they leave test accounts and codes behind), or set E2E_ALLOW_ANY_DB=1.`);
  }
  if (problems.length > 0) refuse(problems.map((p) => `  - ${p}`).join('\n'));
})();

// ── Results ────────────────────────────────────────────────────

let checks = 0;
let failures = 0;

/** Record one check. `detail` is printed (as JSON) when it fails. */
export function check(name, condition, detail) {
  checks++;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
  }
}

/** Start a group of checks. */
export function section(title) {
  console.log(title);
}

/** Print the summary line the runner reads, and exit non-zero if anything failed. */
export function finish() {
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

/** Wrap a suite's main function: report an unexpected error as a failure. */
export function run(main) {
  Promise.resolve()
    .then(main)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

/** Mark a suite as not applicable here (the runner reports it as skipped). */
export function skip(reason) {
  console.log(`SKIPPED: ${reason}`);
  process.exit(3);
}

// ── Small utilities ────────────────────────────────────────────

export const stamp = Date.now();
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Escape text for use inside a RegExp (a URL, say). */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Poll `fn` until it returns something truthy (or the time runs out). */
export async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
}

/**
 * A random client IP for the x-forwarded-for header. The app's rate limits (for
 * example 10 sign-ups per 15 minutes) are per IP, so each request pretends to
 * come from somewhere different.
 */
export function randomIp() {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** Where a suite writes screenshots and downloads. Created on demand. */
export function artifactsFor(suite) {
  const dir = path.join(config.artifactsDir, suite);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Database ───────────────────────────────────────────────────

let dbWorker = null;

function startDbWorker() {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(path.join(here, 'sql-worker.mjs'), {
    workerData: { signal, port: port2 },
    transferList: [port2],
    env: process.env,
  });
  worker.unref(); // never keeps the process alive
  dbWorker = { worker, signal, port: port1 };
}

/**
 * Run one SQL statement against the test database, synchronously, and return the
 * output as text: rows one per line, columns tab-separated, NULL as "NULL" (so
 * `sql('SELECT COUNT(*) FROM users')` is e.g. "42"). A statement that fails
 * throws. A worker thread holds the connection (see sql-worker.mjs) and this
 * blocks until it answers, which takes a millisecond or two.
 *
 * Note it blocks the event loop while waiting, so don't call it thousands of
 * times in a row between HTTP requests: prefer one query that counts or
 * aggregates over a loop of single-row queries.
 */
export function sql(query) {
  if (!dbWorker) startDbWorker();
  const { worker, signal, port } = dbWorker;
  Atomics.store(signal, 0, 0);
  worker.postMessage(query);
  if (Atomics.wait(signal, 0, 0, 30_000) === 'timed-out') {
    throw new Error(`sql() timed out after 30s: ${query.slice(0, 120)}`);
  }
  const { error, output } = receiveMessageOnPort(port).message;
  if (error) throw new Error(`${error}\n  in: ${query.slice(0, 200)}`);
  return output.trim();
}

// ── HTTP ───────────────────────────────────────────────────────

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Call the app's API. `who` is a signed-in user (from register/login), a raw
 * cookie string, or null for no session. `body` is JSON-encoded; `raw` sends the
 * given text as-is instead (for malformed-body tests). Resolves to
 * `{ status, json, text, headers, res }`.
 */
export async function api(who, method, urlPath, body, raw) {
  const cookie = typeof who === 'string' ? who : who?.header;
  const res = await fetch(`${config.baseUrl}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON (a CSV export, an HTML error page): `text` has it
  }
  return { status: res.status, json, text, headers: res.headers, res };
}

function toUser(email, userId, res) {
  const cookie = res.headers.getSetCookie()[0].split(';')[0];
  const [name, ...value] = cookie.split('=');
  return { email, userId, name, value: value.join('='), header: cookie };
}

/** The signed-in user's auth cookie in the shape Playwright's addCookies() wants. */
export function cookieFor(user) {
  return { name: user.name, value: user.value, domain: new URL(config.baseUrl).hostname, path: '/' };
}

/**
 * Create an account through the register API and return
 * `{ email, userId, name, value, header }`: `name` and `value` are the auth
 * cookie (for a Playwright context), `header` is the same as a Cookie header.
 * `pkg` moves the account to a package ('business', 'enterprise' …) so a suite
 * isn't held to the 5-code Starter limit.
 */
export async function register(email, { pkg = null, name = 'E2E Tester' } = {}) {
  const res = await fetch(`${config.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': randomIp() },
    body: JSON.stringify({ email, password: config.password, name, inviteCode: config.inviteCode }),
  });
  if (!res.ok) throw new Error(`register ${email} failed: ${res.status} ${await res.text()}`);
  const userId = Number(sql(`SELECT id FROM users WHERE email='${email}'`));
  if (pkg) sql(`UPDATE users SET package='${pkg}' WHERE id=${userId}`);
  return toUser(email, userId, res);
}

/** Sign in as an existing account created by these suites, or null if that fails. */
export async function login(email, password = config.password) {
  const res = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': randomIp() },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const userId = Number(sql(`SELECT id FROM users WHERE email='${email}'`));
  return toUser(email, userId, res);
}

/** Register the account, or sign in if it already exists. Null if neither works. */
export async function registerOrLogin(email, options) {
  try {
    return await register(email, options);
  } catch {
    return login(email);
  }
}

/**
 * Scan a code the way a phone would, without following the redirect. Resolves
 * to `{ status, location, headers }`. (The scan is recorded after the response,
 * so poll the database if a test needs it to have landed.)
 */
export async function scan(shortId) {
  const res = await fetch(`${config.baseUrl}/r/${shortId}`, {
    redirect: 'manual',
    headers: { 'user-agent': BROWSER_UA, 'x-forwarded-for': randomIp() },
  });
  return { status: res.status, location: res.headers.get('location'), headers: res.headers };
}

// ── Browser ────────────────────────────────────────────────────

/**
 * Playwright is not a dependency of the app (it downloads browsers), so it is
 * loaded on demand. A suite that needs it calls this first; without it the
 * suite is reported as skipped, not failed. Resolves through CommonJS so a
 * global install (NODE_PATH) is found as well as a local one.
 */
export function playwrightOrSkip() {
  try {
    return require('playwright');
  } catch {
    return skip('Playwright is not installed (npm i -D playwright && npx playwright install chromium)');
  }
}

/** A Chromium instance, or skip the suite when Playwright isn't available. */
export async function launchBrowser() {
  const { chromium } = playwrightOrSkip();
  return chromium.launch();
}
