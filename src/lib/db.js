/**
 * Database initialization and helper functions for the QR code generator.
 *
 * Uses mysql2 (promise API) with a connection pool, suitable for a managed
 * MySQL/MariaDB database on shared hosting (e.g. Hostinger Business).
 *
 * IMPORTANT: unlike the previous better-sqlite3 implementation, every helper
 * here is ASYNC and returns a Promise — callers must `await` them.
 *
 * Connection is configured via environment variables:
 *   MYSQL_HOST              (default: localhost)
 *   MYSQL_PORT              (default: 3306)
 *   MYSQL_USER             (required)
 *   MYSQL_PASSWORD         (required)
 *   MYSQL_DATABASE         (required)
 *   MYSQL_CONNECTION_LIMIT  (default: 5 — keep low on shared hosting)
 */

const mysql = require('mysql2/promise');

// ──────────────────────────────────────────────
// Connection pool (created once per process)
// ──────────────────────────────────────────────
// The pool is lazy: no connection is opened until the first query runs, so
// importing this module (e.g. during `next build`) does not require a live DB.

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  // Shared hosting allows only a handful of concurrent connections.
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 5,
  waitForConnections: true,
  queueLimit: 0,
  // Return DATETIME/TIMESTAMP columns as "YYYY-MM-DD HH:MM:SS" strings (matching
  // the old SQLite behaviour) instead of JS Date objects.
  dateStrings: true,
  // Allow `:name` placeholders (object params) as well as positional `?`.
  namedPlaceholders: true,
  // Keep pooled connections from being silently dropped while idle on shared hosts.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// ──────────────────────────────────────────────
// Schema setup (runs once per process, on first DB access)
// ──────────────────────────────────────────────

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      avatar MEDIUMTEXT NULL,
      package VARCHAR(32) NOT NULL DEFAULT 'starter',
      disabled_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Collections let a user group their codes (e.g. all codes for one client).
  // A code with collection_id IS NULL belongs to the implicit "Default
  // Collection", so no per-user backfill is needed and existing codes keep
  // working. The (user_id, name) unique key stops duplicate names per user.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_collections_user_id (user_id),
      UNIQUE KEY uq_collections_user_name (user_id, name),
      CONSTRAINT fk_collections_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qrcodes (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      short_id VARCHAR(32) NOT NULL UNIQUE,
      user_id INT UNSIGNED NOT NULL,
      collection_id INT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      destination_url VARCHAR(2048) NOT NULL,
      foreground_color VARCHAR(32) NOT NULL DEFAULT '#000000',
      background_color VARCHAR(32) NOT NULL DEFAULT '#ffffff',
      logo_url VARCHAR(2048) NULL,
      dot_style VARCHAR(32) NOT NULL DEFAULT 'square',
      corner_square_style VARCHAR(32) NOT NULL DEFAULT 'square',
      corner_dot_style VARCHAR(32) NOT NULL DEFAULT 'square',
      style_config LONGTEXT NULL,
      content_type VARCHAR(16) NOT NULL DEFAULT 'url',
      content_data TEXT NULL,
      scan_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_qrcodes_user_id (user_id),
      INDEX idx_qrcodes_collection_id (collection_id),
      CONSTRAINT fk_qrcodes_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_qrcodes_collection FOREIGN KEY (collection_id)
        REFERENCES collections(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // The UNIQUE constraint on short_id already provides idx_qrcodes_short_id,
  // and the foreign key reuses idx_qrcodes_user_id — no extra indexes needed.

  // One row per scan, for the analytics dashboard. Times are UTC. The scanner's
  // IP is never stored: only its location and a keyed hash for counting unique
  // scanners (see lib/visitor.js). user_id is copied from the code so
  // account-wide queries don't need a join. Rows go when their code does
  // (ON DELETE CASCADE), and rows older than the retention period are pruned
  // (lib/scanRecorder.js); qrcodes.scan_count keeps the all-time total.
  // destination_url is where the scan was sent and schedule_id the schedule
  // that sent it (NULL = the main destination); both are NULL for scans
  // recorded before they were added. schedule_id has no foreign key, so a scan
  // keeps it after its schedule is deleted.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      qrcode_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      scanned_at DATETIME NOT NULL,
      country_code CHAR(2) NULL,
      region VARCHAR(100) NULL,
      city VARCHAR(100) NULL,
      device_type VARCHAR(16) NULL,
      os VARCHAR(32) NULL,
      browser VARCHAR(32) NULL,
      language VARCHAR(8) NULL,
      visitor_hash CHAR(16) NULL,
      is_bot TINYINT(1) NOT NULL DEFAULT 0,
      destination_url VARCHAR(2048) NULL,
      schedule_id INT UNSIGNED NULL,
      INDEX idx_scan_events_code_time (qrcode_id, scanned_at),
      INDEX idx_scan_events_user_time (user_id, scanned_at),
      INDEX idx_scan_events_time (scanned_at),
      CONSTRAINT fk_scan_events_qrcode FOREIGN KEY (qrcode_id)
        REFERENCES qrcodes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Each destination a code has pointed to and when it started (UTC), so the
  // dashboard can show scans per destination. Codes created before this table
  // existed have no rows until their destination is first changed.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qrcode_destinations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      qrcode_id INT UNSIGNED NOT NULL,
      destination_url VARCHAR(2048) NOT NULL,
      started_at DATETIME NOT NULL,
      INDEX idx_qrcode_destinations_code (qrcode_id, started_at),
      CONSTRAINT fk_qrcode_destinations_qrcode FOREIGN KEY (qrcode_id)
        REFERENCES qrcodes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Schedules: while one is live, a code's scans go to its URL instead of the
  // main destination (lib/schedules.js decides, at every scan). kind 'range'
  // uses starts_at/ends_at (UTC); kind 'weekly' uses days (a bit per day,
  // 1 = Monday … 64 = Sunday) and start_time/end_time on the local clock in
  // time_zone. position orders the list: when several are live, the lowest
  // position wins within a kind. Rows go when their code does.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qrcode_schedules (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      qrcode_id INT UNSIGNED NOT NULL,
      label VARCHAR(100) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      destination_url VARCHAR(2048) NOT NULL,
      time_zone VARCHAR(64) NOT NULL,
      starts_at DATETIME NULL,
      ends_at DATETIME NULL,
      days TINYINT UNSIGNED NULL,
      start_time TIME NULL,
      end_time TIME NULL,
      position INT UNSIGNED NOT NULL DEFAULT 0,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_qrcode_schedules_code (qrcode_id, enabled),
      CONSTRAINT fk_qrcode_schedules_qrcode FOREIGN KEY (qrcode_id)
        REFERENCES qrcodes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Text of the legal pages (slug 'privacy' or 'terms'), edited from
  // /admin/legal. No row means the page still shows its placeholder text
  // (lib/legalDefaults.js). last_updated is the date shown on the page;
  // updated_at (UTC) and updated_by record the last save.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_pages (
      slug VARCHAR(32) NOT NULL PRIMARY KEY,
      content MEDIUMTEXT NOT NULL,
      last_updated DATE NOT NULL,
      updated_at DATETIME NOT NULL,
      updated_by INT UNSIGNED NULL,
      CONSTRAINT fk_legal_pages_user FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Requests from the "Request access" form on the public pages, listed at
  // /admin/invites. package is the plan they're interested in (NULL = not
  // sure). handled_at / handled_by record who marked it done, and when; NULL
  // means it's still open. Times are UTC.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invite_requests (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      company VARCHAR(255) NULL,
      phone VARCHAR(40) NULL,
      package VARCHAR(32) NULL,
      created_at DATETIME NOT NULL,
      handled_at DATETIME NULL,
      handled_by INT UNSIGNED NULL,
      INDEX idx_invite_requests_created_at (created_at),
      CONSTRAINT fk_invite_requests_user FOREIGN KEY (handled_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Idempotently add columns that may be missing on databases created with an
 * older schema (mirrors the auto-migration the SQLite version performed).
 * MySQL/MariaDB do not portably support `ADD COLUMN IF NOT EXISTS`, so we check
 * INFORMATION_SCHEMA first.
 */
async function migrateColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qrcodes'`
  );
  const columns = new Set(rows.map((r) => r.COLUMN_NAME));

  const additions = [
    ['logo_url', 'ADD COLUMN logo_url VARCHAR(2048) NULL'],
    ['dot_style', "ADD COLUMN dot_style VARCHAR(32) NOT NULL DEFAULT 'square'"],
    ['corner_square_style', "ADD COLUMN corner_square_style VARCHAR(32) NOT NULL DEFAULT 'square'"],
    ['corner_dot_style', "ADD COLUMN corner_dot_style VARCHAR(32) NOT NULL DEFAULT 'square'"],
    ['style_config', 'ADD COLUMN style_config LONGTEXT NULL'],
    // Collection grouping. On databases migrated from an older schema we add the
    // column and its index but not a foreign key — deleteCollection() reverts a
    // deleted collection's codes to Default in app code, so integrity holds
    // without relying on ON DELETE SET NULL.
    ['collection_id', 'ADD COLUMN collection_id INT UNSIGNED NULL, ADD INDEX idx_qrcodes_collection_id (collection_id)'],
    // What the code does (lib/contentTypes.js). Every code that already
    // exists is a website code, the only kind there was, so the default fills
    // them in. content_data is only used by static types (Wi-Fi), and holds
    // their content encrypted (lib/codeContent.js).
    ['content_type', "ADD COLUMN content_type VARCHAR(16) NOT NULL DEFAULT 'url'"],
    ['content_data', 'ADD COLUMN content_data TEXT NULL'],
  ];

  const clausesToAdd = [];
  for (const [name, clause] of additions) {
    if (!columns.has(name)) {
      clausesToAdd.push(clause);
    }
  }

  if (clausesToAdd.length > 0) {
    await pool.query(`ALTER TABLE qrcodes ${clausesToAdd.join(', ')}`);
  }
}

/**
 * Idempotently add columns that may be missing on the `users` table (e.g. the
 * `avatar` column added after the table was first created).
 */
async function migrateUserColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const columns = new Set(rows.map((r) => r.COLUMN_NAME));

  if (!columns.has('avatar')) {
    await pool.query('ALTER TABLE users ADD COLUMN avatar MEDIUMTEXT NULL');
  }

  // Packages limit how many QR codes an account can create. Accounts that
  // existed before packages were introduced are moved to Enterprise (unlimited)
  // so none of them is suddenly over a limit. Adding the column with an
  // 'enterprise' default fills every existing row in the same statement; the
  // default is then switched to 'starter' for accounts created from now on.
  if (!columns.has('package')) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN package VARCHAR(32) NOT NULL DEFAULT 'enterprise'"
    );
    await pool.query("ALTER TABLE users ALTER COLUMN package SET DEFAULT 'starter'");
  }

  // When an admin disabled the account; NULL means active. Existing accounts
  // get NULL, so they all stay active.
  if (!columns.has('disabled_at')) {
    await pool.query('ALTER TABLE users ADD COLUMN disabled_at DATETIME NULL');
  }
}

/**
 * Idempotently add columns that may be missing on the `scan_events` table.
 * They're nullable and added at the end, which MariaDB (10.3+) and MySQL 8 do
 * instantly, without rewriting the table. Existing scans read NULL.
 */
async function migrateScanEventColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scan_events'`
  );
  const columns = new Set(rows.map((r) => r.COLUMN_NAME));

  const additions = [
    ['destination_url', 'ADD COLUMN destination_url VARCHAR(2048) NULL'],
    ['schedule_id', 'ADD COLUMN schedule_id INT UNSIGNED NULL'],
  ];
  const clausesToAdd = additions.filter(([name]) => !columns.has(name)).map(([, clause]) => clause);

  if (clausesToAdd.length > 0) {
    await pool.query(`ALTER TABLE scan_events ${clausesToAdd.join(', ')}`);
  }
}

// Ensure the schema is set up exactly once. The shared promise means concurrent
// first requests all wait on the same initialization rather than racing.
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await initSchema();
      await migrateColumns();
      await migrateUserColumns();
      await migrateScanEventColumns();
    })().catch((err) => {
      // Allow a later request to retry if init failed (e.g. transient outage).
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

/** Safely parse a stored style_config JSON string into an object (null on empty/invalid). */
function parseStyleConfig(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Look up a user by email address. */
async function getUserByEmail(email) {
  await ensureSchema();
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = :email LIMIT 1',
    { email }
  );
  return rows[0] || null;
}

/** Look up a user by ID. */
async function getUserById(id) {
  await ensureSchema();
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Create a new user and return the created record. `packageId` must already be
 * validated by the caller (see lib/packages.js).
 */
async function createUser(email, passwordHash, name, packageId = 'starter') {
  await ensureSchema();
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, name, package) VALUES (:email, :passwordHash, :name, :packageId)',
    { email, passwordHash, name, packageId }
  );
  return getUserById(result.insertId);
}

/** Change a user's package. Returns the updated record, or null if no such user. */
async function updateUserPackage(userId, packageId) {
  await ensureSchema();
  await pool.execute(
    'UPDATE users SET package = :packageId WHERE id = :userId',
    { userId, packageId }
  );
  // Re-read rather than trusting affectedRows, which is 0 when the package
  // didn't actually change.
  return getUserById(userId);
}

/**
 * Is this user allowed to use the app? False for disabled and deleted
 * accounts. Checked on every signed-in request (see getSession), so it's a
 * single primary-key lookup.
 */
async function isActiveUser(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    'SELECT disabled_at FROM users WHERE id = :userId LIMIT 1',
    { userId }
  );
  return Boolean(rows[0]) && rows[0].disabled_at === null;
}

/**
 * Disable or re-enable an account. A disabled account can't sign in and its QR
 * codes show an "inactive" page instead of redirecting; nothing is deleted.
 * Disabling an already-disabled account keeps its original disabled date.
 * Returns the updated record, or null if no such user.
 */
async function setUserDisabled(userId, disabled) {
  await ensureSchema();
  if (disabled) {
    await pool.execute(
      'UPDATE users SET disabled_at = COALESCE(disabled_at, CURRENT_TIMESTAMP) WHERE id = :userId',
      { userId }
    );
  } else {
    await pool.execute('UPDATE users SET disabled_at = NULL WHERE id = :userId', { userId });
  }
  return getUserById(userId);
}

/**
 * Permanently delete an account with all its QR codes and collections, in one
 * transaction so it can't half-apply. Only a disabled account can be deleted:
 * the row is locked first, so it can't be re-enabled mid-delete.
 *
 * Returns `{ ok: true, deletedCodes }`, or `{ ok: false, reason }` where
 * reason is 'no_user' or 'not_disabled'.
 */
async function deleteAccount(userId) {
  await ensureSchema();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.execute(
      'SELECT disabled_at FROM users WHERE id = :userId FOR UPDATE',
      { userId }
    );
    if (!users[0]) {
      await conn.rollback();
      return { ok: false, reason: 'no_user' };
    }
    if (users[0].disabled_at === null) {
      await conn.rollback();
      return { ok: false, reason: 'not_disabled' };
    }

    // Codes first: they reference both the user and the user's collections.
    const [codes] = await conn.execute('DELETE FROM qrcodes WHERE user_id = :userId', { userId });
    await conn.execute('DELETE FROM collections WHERE user_id = :userId', { userId });
    await conn.execute('DELETE FROM users WHERE id = :userId', { userId });

    await conn.commit();
    return { ok: true, deletedCodes: codes.affectedRows };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Account summary used by the admin dashboard: profile, package and QR code
// usage. Uploaded avatar images (data URLs) are left out to keep the response
// small; preset avatars are short URLs and are included.
const ACCOUNT_SUMMARY_SQL = `
  SELECT
    u.id,
    u.name,
    u.email,
    CASE WHEN u.avatar LIKE 'data:%' THEN NULL ELSE u.avatar END AS avatar,
    u.package,
    u.disabled_at AS disabledAt,
    u.created_at AS createdAt,
    COALESCE(s.codeCount, 0) AS codeCount,
    COALESCE(s.scanCount, 0) AS scanCount
  FROM users u
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS codeCount, SUM(scan_count) AS scanCount
    FROM qrcodes
    GROUP BY user_id
  ) s ON s.user_id = u.id`;

function toAccountSummary(row) {
  // COUNT/SUM come back as strings (BIGINT/DECIMAL) — coerce to numbers.
  return {
    ...row,
    codeCount: Number(row.codeCount) || 0,
    scanCount: Number(row.scanCount) || 0,
  };
}

/** List every account with its package and usage, newest first. */
async function getAllAccounts() {
  await ensureSchema();
  const [rows] = await pool.query(
    `${ACCOUNT_SUMMARY_SQL} ORDER BY u.created_at DESC, u.id DESC`
  );
  return rows.map(toAccountSummary);
}

/** One account's package and usage summary, or null if not found. */
async function getAccountById(id) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `${ACCOUNT_SUMMARY_SQL} WHERE u.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] ? toAccountSummary(rows[0]) : null;
}

/** Update a user's display name and avatar. Returns the updated record. */
async function updateUserProfile(userId, { name, avatar }) {
  await ensureSchema();
  await pool.execute(
    'UPDATE users SET name = :name, avatar = :avatar WHERE id = :userId',
    { userId, name, avatar: avatar ?? null }
  );
  return getUserById(userId);
}

/** Update a user's password hash. */
async function updateUserPassword(userId, passwordHash) {
  await ensureSchema();
  await pool.execute(
    'UPDATE users SET password_hash = :passwordHash WHERE id = :userId',
    { userId, passwordHash }
  );
}

// A code's main destination is the latest destination history row that has
// started; rows that start in the future are scheduled changes. Codes with no
// history (created before it was kept, and never changed) use the URL stored
// on the code. Every read of a code's destination goes through this, so the
// redirect, the dashboard and the API all agree, with nothing to run on a
// timer when a change starts.
const LIVE_DESTINATION_SQL = `COALESCE(
  (SELECT d.destination_url FROM qrcode_destinations d
    WHERE d.qrcode_id = q.id AND d.started_at <= UTC_TIMESTAMP()
    ORDER BY d.started_at DESC, d.id DESC
    LIMIT 1),
  q.destination_url)`;

/** "YYYY-MM-DD HH:MM:SS" (UTC, as stored) → ISO string. */
function utcToIso(value) {
  return `${String(value).replace(' ', 'T')}Z`;
}

/** A `SELECT q.*, … AS live_destination_url` row with destination_url set to the live one. */
function withLiveDestination(row) {
  if (!row) return null;
  const { live_destination_url: live, ...rest } = row;
  return { ...rest, destination_url: live };
}

/** Get all QR codes belonging to a user, newest first (camelCase keys). */
async function getQRCodesByUserId(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT
       q.id,
       q.short_id AS shortId,
       q.user_id AS userId,
       q.collection_id AS collectionId,
       q.title,
       ${LIVE_DESTINATION_SQL} AS destinationUrl,
       q.foreground_color AS fgColor,
       q.background_color AS bgColor,
       q.logo_url AS logoUrl,
       q.dot_style AS dotStyle,
       q.corner_square_style AS cornerSquareStyle,
       q.corner_dot_style AS cornerDotStyle,
       q.style_config AS styleConfig,
       q.content_type AS contentType,
       q.content_data AS contentData,
       q.scan_count AS scanCount,
       q.created_at AS createdAt,
       q.updated_at AS updatedAt
     FROM qrcodes q
     WHERE q.user_id = :userId
     ORDER BY q.created_at DESC`,
    { userId }
  );
  const [changes] = await pool.execute(
    `SELECT d.id, d.qrcode_id AS qrcodeId, d.destination_url AS destinationUrl, d.started_at AS startsAt
     FROM qrcode_destinations d
     JOIN qrcodes q ON q.id = d.qrcode_id
     WHERE q.user_id = :userId AND d.started_at > UTC_TIMESTAMP()
     ORDER BY d.started_at, d.id`,
    { userId }
  );
  const changesByCode = new Map();
  for (const { qrcodeId, ...change } of changes) {
    if (!changesByCode.has(qrcodeId)) changesByCode.set(qrcodeId, []);
    changesByCode.get(qrcodeId).push({ ...change, startsAt: utcToIso(change.startsAt) });
  }
  for (const row of rows) {
    // style_config is stored as a JSON string; expose it as a parsed object.
    row.styleConfig = parseStyleConfig(row.styleConfig);
    row.scheduledChanges = changesByCode.get(row.id) ?? [];
  }
  return rows;
}

/**
 * Get a single QR code by ID, verifying ownership. Returns null if not found
 * or not owned. `destination_url` is the main destination that is live now.
 */
async function getQRCodeById(id, userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT q.*, ${LIVE_DESTINATION_SQL} AS live_destination_url
     FROM qrcodes q
     WHERE q.id = :id AND q.user_id = :userId
     LIMIT 1`,
    { id, userId }
  );
  return withLiveDestination(rows[0]);
}

/**
 * Get a QR code by its short ID (used for public redirect lookup — no auth
 * check). `destination_url` is the main destination that is live now.
 * Includes `owner_disabled_at`, which is set when the owner's account is
 * disabled and the code should show the inactive page instead.
 */
async function getQRCodeByShortId(shortId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT q.*, u.disabled_at AS owner_disabled_at, ${LIVE_DESTINATION_SQL} AS live_destination_url
     FROM qrcodes q
     JOIN users u ON u.id = q.user_id
     WHERE q.short_id = :shortId
     LIMIT 1`,
    { shortId }
  );
  return withLiveDestination(rows[0]);
}

/**
 * A code's scheduled changes to its main destination (history rows that
 * haven't started yet), soonest first: `[{ id, destinationUrl, startsAt }]`
 * with `startsAt` as an ISO string. The caller checks ownership.
 */
async function getScheduledDestinationChanges(qrcodeId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT id, destination_url AS destinationUrl, started_at AS startsAt
     FROM qrcode_destinations
     WHERE qrcode_id = :qrcodeId AND started_at > UTC_TIMESTAMP()
     ORDER BY started_at, id`,
    { qrcodeId }
  );
  return rows.map((r) => ({ ...r, startsAt: utcToIso(r.startsAt) }));
}

/**
 * Schedule a code's main destination to change to `destinationUrl` at
 * `startsAt` ("YYYY-MM-DD HH:MM:SS", UTC, in the future), as a destination
 * history row that starts then. At most `limit` changes can wait at once.
 *
 * Returns `{ ok: true }`, or `{ ok: false, reason: 'not_found' }` when the
 * code isn't the user's, `{ ok: false, reason: 'unsupported' }` when it isn't
 * a website code, or `{ ok: false, reason: 'limit' }`.
 */
async function scheduleDestinationChange(id, userId, { destinationUrl, startsAt }, limit) {
  await ensureSchema();
  const existing = await getQRCodeById(id, userId);
  if (!existing) return { ok: false, reason: 'not_found' };
  // Only website codes can change to another link later (lib/contentTypes.js).
  if (existing.content_type !== 'url') return { ok: false, reason: 'unsupported' };

  const pending = await getScheduledDestinationChanges(id);
  if (pending.length >= limit) return { ok: false, reason: 'limit' };

  await ensureDestinationHistory(existing);
  await pool.execute(
    `INSERT INTO qrcode_destinations (qrcode_id, destination_url, started_at)
     VALUES (:qrcodeId, :destinationUrl, :startsAt)`,
    { qrcodeId: id, destinationUrl, startsAt }
  );
  return { ok: true };
}

/**
 * Cancel a scheduled change to a code's main destination. Only a change that
 * hasn't started can be cancelled: once it has, it's part of the history.
 * Returns 'cancelled', 'not_found' or 'started'.
 */
async function cancelDestinationChange(id, userId, changeId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT d.started_at > UTC_TIMESTAMP() AS pending
     FROM qrcode_destinations d
     JOIN qrcodes q ON q.id = d.qrcode_id
     WHERE d.id = :changeId AND d.qrcode_id = :id AND q.user_id = :userId
     LIMIT 1`,
    { changeId, id, userId }
  );
  if (!rows[0]) return 'not_found';
  if (!Number(rows[0].pending)) return 'started';

  // Checked again in the delete, in case it started in the meantime.
  const [result] = await pool.execute(
    `DELETE FROM qrcode_destinations
     WHERE id = :changeId AND qrcode_id = :id AND started_at > UTC_TIMESTAMP()`,
    { changeId, id }
  );
  return result.affectedRows > 0 ? 'cancelled' : 'started';
}

/**
 * Create a new QR code record, unless the owner's package limit is reached.
 * `styleConfig` (when provided) is a plain object stored as JSON.
 *
 * `getLimit(packageId)` returns the package's code limit (null = unlimited);
 * it's passed in so this module stays free of package rules.
 *
 * The owner's row is locked while counting, so two simultaneous requests
 * can't both slip in under the limit.
 *
 * Returns `{ ok: true, qrcode }`, or `{ ok: false, reason: 'limit', limit }`
 * when the limit is reached, or `{ ok: false, reason: 'no_user' }`.
 */
async function createQRCodeWithinLimit(
  { shortId, userId, collectionId, title, destinationUrl, contentType, contentData, foregroundColor, backgroundColor, logoUrl, dotStyle, cornerSquareStyle, cornerDotStyle, styleConfig },
  getLimit
) {
  await ensureSchema();
  const conn = await pool.getConnection();
  let insertId;
  try {
    await conn.beginTransaction();

    const [users] = await conn.execute(
      'SELECT package FROM users WHERE id = :userId FOR UPDATE',
      { userId }
    );
    if (!users[0]) {
      await conn.rollback();
      return { ok: false, reason: 'no_user' };
    }

    const limit = getLimit(users[0].package);
    if (limit !== null) {
      const [counts] = await conn.execute(
        'SELECT COUNT(*) AS count FROM qrcodes WHERE user_id = :userId',
        { userId }
      );
      if (Number(counts[0].count) >= limit) {
        await conn.rollback();
        return { ok: false, reason: 'limit', limit };
      }
    }

    const [result] = await conn.execute(
      `INSERT INTO qrcodes
         (short_id, user_id, collection_id, title, destination_url, content_type, content_data, foreground_color, background_color, logo_url, dot_style, corner_square_style, corner_dot_style, style_config)
       VALUES
         (:shortId, :userId, :collectionId, :title, :destinationUrl, :contentType, :contentData, :foregroundColor, :backgroundColor, :logoUrl, :dotStyle, :cornerSquareStyle, :cornerDotStyle, :styleConfig)`,
      {
        shortId,
        userId,
        collectionId: collectionId ?? null,
        title,
        destinationUrl,
        contentType: contentType || 'url',
        contentData: contentData ?? null,
        foregroundColor: foregroundColor || '#000000',
        backgroundColor: backgroundColor || '#ffffff',
        logoUrl: logoUrl || null,
        dotStyle: dotStyle || 'square',
        cornerSquareStyle: cornerSquareStyle || 'square',
        cornerDotStyle: cornerDotStyle || 'square',
        styleConfig: styleConfig != null ? JSON.stringify(styleConfig) : null,
      }
    );
    // Static codes (destination '') have no destination to keep a history of.
    if (destinationUrl) {
      await conn.execute(
        `INSERT INTO qrcode_destinations (qrcode_id, destination_url, started_at)
         VALUES (:qrcodeId, :destinationUrl, UTC_TIMESTAMP())`,
        { qrcodeId: result.insertId, destinationUrl }
      );
    }
    await conn.commit();
    insertId = result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { ok: true, qrcode: await getQRCodeById(insertId, userId) };
}

/** Update an existing QR code. Returns the updated record or null if not found/not owned. */
async function updateQRCode(id, userId, { title, destinationUrl, foregroundColor, backgroundColor, logoUrl, dotStyle, cornerSquareStyle, cornerDotStyle, styleConfig, collectionId }) {
  await ensureSchema();
  const existing = await getQRCodeById(id, userId);
  if (!existing) return null;

  await pool.execute(
    `UPDATE qrcodes
       SET title = :title,
           destination_url = :destinationUrl,
           foreground_color = :foregroundColor,
           background_color = :backgroundColor,
           logo_url = :logoUrl,
           dot_style = :dotStyle,
           corner_square_style = :cornerSquareStyle,
           corner_dot_style = :cornerDotStyle,
           style_config = :styleConfig,
           collection_id = :collectionId,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND user_id = :userId`,
    {
      id,
      userId,
      title: title ?? existing.title,
      destinationUrl: destinationUrl ?? existing.destination_url,
      foregroundColor: foregroundColor ?? existing.foreground_color,
      backgroundColor: backgroundColor ?? existing.background_color,
      logoUrl: logoUrl !== undefined ? logoUrl : existing.logo_url,
      dotStyle: dotStyle ?? existing.dot_style,
      cornerSquareStyle: cornerSquareStyle ?? existing.corner_square_style,
      cornerDotStyle: cornerDotStyle ?? existing.corner_dot_style,
      // Replace when a new config is supplied; otherwise keep the stored JSON string.
      styleConfig: styleConfig != null ? JSON.stringify(styleConfig) : existing.style_config,
      // `collectionId` is tri-state: a number moves the code, null moves it to
      // the Default Collection, and undefined leaves it where it is. (null vs
      // undefined matters here — `??` would treat an intentional null as "keep".)
      collectionId: collectionId !== undefined ? collectionId : existing.collection_id,
    }
  );

  if (destinationUrl != null && destinationUrl !== existing.destination_url) {
    await recordDestinationChange(existing, destinationUrl);
  }

  return getQRCodeById(id, userId);
}

/**
 * Give a code created before destination history was kept a history row for
 * its current destination, dated from when the code was created, so a change
 * doesn't hide where it pointed before.
 */
async function ensureDestinationHistory(existing) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS count FROM qrcode_destinations WHERE qrcode_id = :qrcodeId',
    { qrcodeId: existing.id }
  );
  if (Number(rows[0].count) === 0) {
    await pool.execute(
      `INSERT INTO qrcode_destinations (qrcode_id, destination_url, started_at)
       VALUES (:qrcodeId, :destinationUrl, :startedAt)`,
      { qrcodeId: existing.id, destinationUrl: existing.destination_url, startedAt: existing.created_at }
    );
  }
}

/** Add a destination history row, starting now, when a code's destination changes. */
async function recordDestinationChange(existing, newUrl) {
  await ensureDestinationHistory(existing);
  await pool.execute(
    `INSERT INTO qrcode_destinations (qrcode_id, destination_url, started_at)
     VALUES (:qrcodeId, :destinationUrl, UTC_TIMESTAMP())`,
    { qrcodeId: existing.id, destinationUrl: newUrl }
  );
}

/** Delete a QR code. Returns true if a row was deleted, false otherwise. */
async function deleteQRCode(id, userId) {
  await ensureSchema();
  const [result] = await pool.execute(
    'DELETE FROM qrcodes WHERE id = :id AND user_id = :userId',
    { id, userId }
  );
  return result.affectedRows > 0;
}

/**
 * Record one scan: add 1 to the code's all-time total (unless it's a bot)
 * and store the scan's details for analytics. The total is updated first, so
 * it stays right even if storing the details fails. `destinationUrl` is where
 * the scan was sent and `scheduleId` the schedule that sent it (null for the
 * main destination).
 */
async function recordScan({
  qrcodeId, userId, countryCode, region, city, deviceType, os, browser, language, visitorHash, isBot,
  destinationUrl, scheduleId,
}) {
  await ensureSchema();
  if (!isBot) {
    await pool.execute(
      'UPDATE qrcodes SET scan_count = scan_count + 1 WHERE id = :qrcodeId',
      { qrcodeId }
    );
  }
  await pool.execute(
    `INSERT INTO scan_events
       (qrcode_id, user_id, scanned_at, country_code, region, city, device_type, os, browser, language, visitor_hash, is_bot, destination_url, schedule_id)
     VALUES
       (:qrcodeId, :userId, UTC_TIMESTAMP(), :countryCode, :region, :city, :deviceType, :os, :browser, :language, :visitorHash, :isBot, :destinationUrl, :scheduleId)`,
    {
      qrcodeId,
      userId,
      countryCode: countryCode ?? null,
      region: region ?? null,
      city: city ?? null,
      deviceType: deviceType ?? null,
      os: os ?? null,
      browser: browser ?? null,
      language: language ?? null,
      visitorHash: visitorHash ?? null,
      isBot: isBot ? 1 : 0,
      destinationUrl: destinationUrl ?? null,
      scheduleId: scheduleId ?? null,
    }
  );
}

/**
 * Delete scan rows older than `cutoff` ("YYYY-MM-DD HH:MM:SS", UTC) in small
 * batches, so a large first prune can't lock the table for long. Codes' totals
 * in scan_count are untouched. Returns the number of rows deleted.
 */
async function pruneScanEvents(cutoff, batchSize = 5000) {
  await ensureSchema();
  const limit = Math.max(1, Math.floor(batchSize));
  let deleted = 0;
  for (;;) {
    const [result] = await pool.execute(
      `DELETE FROM scan_events WHERE scanned_at < :cutoff ORDER BY scanned_at LIMIT ${limit}`,
      { cutoff }
    );
    deleted += result.affectedRows;
    if (result.affectedRows < limit) return deleted;
  }
}

// ──────────────────────────────────────────────
// Schedules
// ──────────────────────────────────────────────
// Callers are API routes, which check the account's package; these helpers
// check that the code belongs to the user.

// A schedule that can still be live: date ranges whose end hasn't passed, and
// every weekly schedule. Ended date ranges are kept (listed under "Ended")
// but never loaded for a scan and don't count toward the per-code limit.
const NOT_ENDED_SQL = '(s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP())';

/** A qrcode_schedules row → the shape lib/schedules.js and the API use. */
function toSchedule(row) {
  return {
    id: row.id,
    qrcodeId: row.qrcode_id,
    label: row.label,
    kind: row.kind,
    destinationUrl: row.destination_url,
    timeZone: row.time_zone,
    startsAt: row.starts_at ? utcToIso(row.starts_at) : null,
    endsAt: row.ends_at ? utcToIso(row.ends_at) : null,
    days: row.days,
    // TIME comes back as "HH:MM:SS"; the minutes are all that's set.
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    position: row.position,
    enabled: Boolean(Number(row.enabled)),
  };
}

/** Every schedule of a code, in list order. The caller checks ownership. */
async function getSchedulesForCode(qrcodeId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT s.* FROM qrcode_schedules s
     WHERE s.qrcode_id = :qrcodeId
     ORDER BY s.position, s.id`,
    { qrcodeId }
  );
  return rows.map(toSchedule);
}

/**
 * The schedules a scan of this code has to check: switched on and not ended.
 * Used by the public redirect, so it's one small indexed query.
 */
async function getLiveCandidateSchedules(qrcodeId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT s.* FROM qrcode_schedules s
     WHERE s.qrcode_id = :qrcodeId AND s.enabled = 1 AND ${NOT_ENDED_SQL}
     ORDER BY s.position, s.id`,
    { qrcodeId }
  );
  return rows.map(toSchedule);
}

/** All of a user's schedules that haven't ended, across their codes, in list order. */
async function getNotEndedSchedulesByUserId(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT s.* FROM qrcode_schedules s
     JOIN qrcodes q ON q.id = s.qrcode_id
     WHERE q.user_id = :userId AND ${NOT_ENDED_SQL}
     ORDER BY s.qrcode_id, s.position, s.id`,
    { userId }
  );
  return rows.map(toSchedule);
}

/** One schedule, if it belongs to this code and the code to this user. */
async function getSchedule(qrcodeId, userId, scheduleId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT s.* FROM qrcode_schedules s
     JOIN qrcodes q ON q.id = s.qrcode_id
     WHERE s.id = :scheduleId AND s.qrcode_id = :qrcodeId AND q.user_id = :userId
     LIMIT 1`,
    { scheduleId, qrcodeId, userId }
  );
  return rows[0] ? toSchedule(rows[0]) : null;
}

/**
 * Add a schedule to the end of a code's list. `schedule` has `label`, `kind`,
 * `destinationUrl`, `timeZone` and the fields for its kind (`startsAt` and
 * `endsAt` as UTC "YYYY-MM-DD HH:MM:SS"; `days`, `startTime`, `endTime`).
 * At most `limit` schedules that haven't ended can exist per code.
 *
 * Returns `{ ok: true, id }`, or `{ ok: false, reason: 'not_found' | 'unsupported' | 'limit' }`
 * ('unsupported': not a website code).
 */
async function createSchedule(qrcodeId, userId, schedule, limit) {
  await ensureSchema();
  const [codes] = await pool.execute(
    'SELECT id, content_type FROM qrcodes WHERE id = :qrcodeId AND user_id = :userId LIMIT 1',
    { qrcodeId, userId }
  );
  if (!codes[0]) return { ok: false, reason: 'not_found' };
  // Schedules send scans to another website, so only website codes have them.
  if (codes[0].content_type !== 'url') return { ok: false, reason: 'unsupported' };

  const [counts] = await pool.execute(
    `SELECT COUNT(*) AS count, (SELECT COALESCE(MAX(position) + 1, 0) FROM qrcode_schedules WHERE qrcode_id = :qrcodeId) AS nextPosition
     FROM qrcode_schedules s
     WHERE s.qrcode_id = :qrcodeId AND ${NOT_ENDED_SQL}`,
    { qrcodeId }
  );
  if (Number(counts[0].count) >= limit) return { ok: false, reason: 'limit' };

  const [result] = await pool.execute(
    `INSERT INTO qrcode_schedules
       (qrcode_id, label, kind, destination_url, time_zone, starts_at, ends_at, days, start_time, end_time, position, enabled)
     VALUES
       (:qrcodeId, :label, :kind, :destinationUrl, :timeZone, :startsAt, :endsAt, :days, :startTime, :endTime, :position, 1)`,
    {
      qrcodeId,
      label: schedule.label,
      kind: schedule.kind,
      destinationUrl: schedule.destinationUrl,
      timeZone: schedule.timeZone,
      startsAt: schedule.startsAt ?? null,
      endsAt: schedule.endsAt ?? null,
      days: schedule.days ?? null,
      startTime: schedule.startTime ?? null,
      endTime: schedule.endTime ?? null,
      position: Number(counts[0].nextPosition),
    }
  );
  return { ok: true, id: result.insertId };
}

// Fields a schedule update may set, and their columns.
const SCHEDULE_COLUMNS = {
  label: 'label',
  destinationUrl: 'destination_url',
  timeZone: 'time_zone',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  days: 'days',
  startTime: 'start_time',
  endTime: 'end_time',
  enabled: 'enabled',
};

/**
 * Change some of a schedule's fields (keys of SCHEDULE_COLUMNS; times as UTC
 * "YYYY-MM-DD HH:MM:SS"). Returns false if the schedule isn't the user's.
 */
async function updateSchedule(qrcodeId, userId, scheduleId, fields) {
  if (!(await getSchedule(qrcodeId, userId, scheduleId))) return false;

  const sets = [];
  const params = { scheduleId };
  for (const [key, column] of Object.entries(SCHEDULE_COLUMNS)) {
    if (fields[key] === undefined) continue;
    sets.push(`${column} = :${key}`);
    params[key] = key === 'enabled' ? (fields[key] ? 1 : 0) : fields[key];
  }
  if (sets.length > 0) {
    await pool.execute(
      `UPDATE qrcode_schedules SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :scheduleId`,
      params
    );
  }
  return true;
}

/** Delete a schedule. Returns false if it isn't the user's. */
async function deleteSchedule(qrcodeId, userId, scheduleId) {
  if (!(await getSchedule(qrcodeId, userId, scheduleId))) return false;
  await pool.execute('DELETE FROM qrcode_schedules WHERE id = :scheduleId', { scheduleId });
  return true;
}

/**
 * Put a code's schedules in the order given by `ids`, which must list every
 * one of them exactly once. Returns 'ok', 'not_found' (not the user's code)
 * or 'mismatch' (the ids aren't exactly the code's schedules).
 */
async function reorderSchedules(qrcodeId, userId, ids) {
  await ensureSchema();
  const [codes] = await pool.execute(
    'SELECT id FROM qrcodes WHERE id = :qrcodeId AND user_id = :userId LIMIT 1',
    { qrcodeId, userId }
  );
  if (!codes[0]) return 'not_found';

  const [rows] = await pool.execute('SELECT id FROM qrcode_schedules WHERE qrcode_id = :qrcodeId', { qrcodeId });
  const existing = new Set(rows.map((r) => r.id));
  if (ids.length !== existing.size || new Set(ids).size !== ids.length || !ids.every((id) => existing.has(id))) {
    return 'mismatch';
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [position, id] of ids.entries()) {
      await conn.execute('UPDATE qrcode_schedules SET position = :position WHERE id = :id', { position, id });
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return 'ok';
}

// ──────────────────────────────────────────────
// Collections
// ──────────────────────────────────────────────

/**
 * List a user's collections (newest first), each with a `count` of the codes
 * assigned to it. The implicit "Default Collection" (codes with no collection)
 * is not returned here — it's surfaced by the client from the unassigned codes.
 */
async function getCollectionsByUserId(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.name,
       c.created_at AS createdAt,
       c.updated_at AS updatedAt,
       COUNT(q.id) AS count
     FROM collections c
     LEFT JOIN qrcodes q ON q.collection_id = c.id
     WHERE c.user_id = :userId
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    { userId }
  );
  // COUNT comes back as a string (BIGINT) — coerce to a number.
  for (const row of rows) {
    row.count = Number(row.count) || 0;
  }
  return rows;
}

/** Get a single collection by ID, verifying ownership. Returns null if not found/not owned. */
async function getCollectionById(id, userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM collections WHERE id = :id AND user_id = :userId LIMIT 1',
    { id, userId }
  );
  return rows[0] || null;
}

/**
 * Create a collection for a user. Throws a mysql2 ER_DUP_ENTRY error if the
 * user already has a collection with the same name (the unique key); callers
 * should translate that into a 409.
 */
async function createCollection(userId, name) {
  await ensureSchema();
  const [result] = await pool.execute(
    'INSERT INTO collections (user_id, name) VALUES (:userId, :name)',
    { userId, name }
  );
  return getCollectionById(result.insertId, userId);
}

/** Rename a collection. Returns the updated record, or null if not found/not owned. */
async function updateCollection(id, userId, name) {
  await ensureSchema();
  const existing = await getCollectionById(id, userId);
  if (!existing) return null;
  await pool.execute(
    'UPDATE collections SET name = :name, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND user_id = :userId',
    { id, userId, name }
  );
  return getCollectionById(id, userId);
}

/**
 * Delete a collection. Any codes assigned to it are reverted to the Default
 * Collection (collection_id set to NULL) first, so deleting a collection never
 * deletes codes. Done in a transaction so the two steps can't half-apply.
 * Returns true if a collection was deleted, false otherwise.
 */
async function deleteCollection(id, userId) {
  await ensureSchema();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      'UPDATE qrcodes SET collection_id = NULL WHERE collection_id = :id AND user_id = :userId',
      { id, userId }
    );
    const [result] = await conn.execute(
      'DELETE FROM collections WHERE id = :id AND user_id = :userId',
      { id, userId }
    );
    await conn.commit();
    return result.affectedRows > 0;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Get aggregate stats for a user: total QR codes and total scans. */
async function getUserStats(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS totalQRCodes,
       COALESCE(SUM(scan_count), 0) AS totalScans
     FROM qrcodes
     WHERE user_id = :userId`,
    { userId }
  );
  const row = rows[0] || {};
  // COUNT/SUM come back as strings (BIGINT/DECIMAL) — coerce to numbers.
  return {
    totalQRCodes: Number(row.totalQRCodes) || 0,
    totalScans: Number(row.totalScans) || 0,
  };
}

// ──────────────────────────────────────────────
// Legal pages
// ──────────────────────────────────────────────

/**
 * The saved text of a legal page, with the name of whoever last saved it
 * (null once that account is gone). Returns null if it has never been saved.
 */
async function getLegalPage(slug) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT lp.slug, lp.content, lp.last_updated, lp.updated_at,
            u.name AS updated_by_name
       FROM legal_pages lp
       LEFT JOIN users u ON u.id = lp.updated_by
      WHERE lp.slug = :slug
      LIMIT 1`,
    { slug }
  );
  return rows[0] || null;
}

/** Create or replace a legal page's text. Returns the saved row. */
async function saveLegalPage(slug, { content, lastUpdated }, userId) {
  await ensureSchema();
  await pool.execute(
    `INSERT INTO legal_pages (slug, content, last_updated, updated_at, updated_by)
     VALUES (:slug, :content, :lastUpdated, UTC_TIMESTAMP(), :userId)
     ON DUPLICATE KEY UPDATE
       content = :content,
       last_updated = :lastUpdated,
       updated_at = UTC_TIMESTAMP(),
       updated_by = :userId`,
    { slug, content, lastUpdated, userId }
  );
  return getLegalPage(slug);
}

// ──────────────────────────────────────────────
// Invite requests
// ──────────────────────────────────────────────

// has_account flags requests from someone who already has an account (emails
// compare case-insensitively under this collation).
const INVITE_REQUEST_SELECT = `
  SELECT ir.id, ir.name, ir.email, ir.company, ir.phone, ir.package,
         ir.created_at, ir.handled_at, hb.name AS handled_by_name,
         EXISTS (SELECT 1 FROM users u WHERE u.email = ir.email) AS has_account
    FROM invite_requests ir
    LEFT JOIN users hb ON hb.id = ir.handled_by`;

/** Save a request from the public form (fields already validated). Returns the saved row. */
async function createInviteRequest({ name, email, company, phone, package: packageId }) {
  await ensureSchema();
  const [result] = await pool.execute(
    `INSERT INTO invite_requests (name, email, company, phone, package, created_at)
     VALUES (:name, :email, :company, :phone, :packageId, UTC_TIMESTAMP())`,
    { name, email, company, phone, packageId }
  );
  return getInviteRequestById(result.insertId);
}

/** One request, or null. */
async function getInviteRequestById(id) {
  await ensureSchema();
  const [rows] = await pool.execute(`${INVITE_REQUEST_SELECT} WHERE ir.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

/** Every request, newest first. */
async function getInviteRequests() {
  await ensureSchema();
  const [rows] = await pool.query(`${INVITE_REQUEST_SELECT} ORDER BY ir.created_at DESC, ir.id DESC`);
  return rows;
}

/** How many requests haven't been marked done yet. */
async function countOpenInviteRequests() {
  await ensureSchema();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM invite_requests WHERE handled_at IS NULL'
  );
  return Number(rows[0]?.count) || 0;
}

/**
 * Mark a request done (by userId) or reopen it. Returns the updated row, or
 * null if there's no such request.
 */
async function setInviteRequestHandled(id, handled, userId) {
  await ensureSchema();
  if (handled) {
    await pool.execute(
      `UPDATE invite_requests SET handled_at = UTC_TIMESTAMP(), handled_by = :userId
        WHERE id = :id AND handled_at IS NULL`,
      { id, userId }
    );
  } else {
    await pool.execute(
      'UPDATE invite_requests SET handled_at = NULL, handled_by = NULL WHERE id = :id',
      { id }
    );
  }
  return getInviteRequestById(id);
}

/** Permanently delete a request. Returns true if one was deleted. */
async function deleteInviteRequest(id) {
  await ensureSchema();
  const [result] = await pool.execute('DELETE FROM invite_requests WHERE id = :id', { id });
  return result.affectedRows > 0;
}

module.exports = {
  pool,
  ensureSchema,
  getUserByEmail,
  getUserById,
  createUser,
  updateUserPackage,
  isActiveUser,
  setUserDisabled,
  deleteAccount,
  getAllAccounts,
  getAccountById,
  updateUserProfile,
  updateUserPassword,
  getQRCodesByUserId,
  getQRCodeById,
  getQRCodeByShortId,
  getScheduledDestinationChanges,
  scheduleDestinationChange,
  cancelDestinationChange,
  getSchedulesForCode,
  getLiveCandidateSchedules,
  getNotEndedSchedulesByUserId,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  reorderSchedules,
  createQRCodeWithinLimit,
  updateQRCode,
  deleteQRCode,
  recordScan,
  pruneScanEvents,
  getUserStats,
  getCollectionsByUserId,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  getLegalPage,
  saveLegalPage,
  createInviteRequest,
  getInviteRequestById,
  getInviteRequests,
  countOpenInviteRequests,
  setInviteRequestHandled,
  deleteInviteRequest,
};
