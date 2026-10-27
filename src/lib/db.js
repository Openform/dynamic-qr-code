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

// Ensure the schema is set up exactly once. The shared promise means concurrent
// first requests all wait on the same initialization rather than racing.
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await initSchema();
      await migrateColumns();
      await migrateUserColumns();
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

/** Get all QR codes belonging to a user, newest first (camelCase keys). */
async function getQRCodesByUserId(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT
       id,
       short_id AS shortId,
       user_id AS userId,
       collection_id AS collectionId,
       title,
       destination_url AS destinationUrl,
       foreground_color AS fgColor,
       background_color AS bgColor,
       logo_url AS logoUrl,
       dot_style AS dotStyle,
       corner_square_style AS cornerSquareStyle,
       corner_dot_style AS cornerDotStyle,
       style_config AS styleConfig,
       scan_count AS scanCount,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM qrcodes
     WHERE user_id = :userId
     ORDER BY created_at DESC`,
    { userId }
  );
  // style_config is stored as a JSON string; expose it as a parsed object.
  for (const row of rows) {
    row.styleConfig = parseStyleConfig(row.styleConfig);
  }
  return rows;
}

/** Get a single QR code by ID, verifying ownership. Returns null if not found or not owned. */
async function getQRCodeById(id, userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    'SELECT * FROM qrcodes WHERE id = :id AND user_id = :userId LIMIT 1',
    { id, userId }
  );
  return rows[0] || null;
}

/**
 * Get a QR code by its short ID (used for public redirect lookup — no auth
 * check). Includes `owner_disabled_at`, which is set when the owner's account
 * is disabled and the code should show the inactive page instead.
 */
async function getQRCodeByShortId(shortId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT q.*, u.disabled_at AS owner_disabled_at
     FROM qrcodes q
     JOIN users u ON u.id = q.user_id
     WHERE q.short_id = :shortId
     LIMIT 1`,
    { shortId }
  );
  return rows[0] || null;
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
  { shortId, userId, collectionId, title, destinationUrl, foregroundColor, backgroundColor, logoUrl, dotStyle, cornerSquareStyle, cornerDotStyle, styleConfig },
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
         (short_id, user_id, collection_id, title, destination_url, foreground_color, background_color, logo_url, dot_style, corner_square_style, corner_dot_style, style_config)
       VALUES
         (:shortId, :userId, :collectionId, :title, :destinationUrl, :foregroundColor, :backgroundColor, :logoUrl, :dotStyle, :cornerSquareStyle, :cornerDotStyle, :styleConfig)`,
      {
        shortId,
        userId,
        collectionId: collectionId ?? null,
        title,
        destinationUrl,
        foregroundColor: foregroundColor || '#000000',
        backgroundColor: backgroundColor || '#ffffff',
        logoUrl: logoUrl || null,
        dotStyle: dotStyle || 'square',
        cornerSquareStyle: cornerSquareStyle || 'square',
        cornerDotStyle: cornerDotStyle || 'square',
        styleConfig: styleConfig != null ? JSON.stringify(styleConfig) : null,
      }
    );
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

  return getQRCodeById(id, userId);
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

/** Increment the scan count for a QR code (by short ID). */
async function incrementScanCount(shortId) {
  await ensureSchema();
  await pool.execute(
    'UPDATE qrcodes SET scan_count = scan_count + 1 WHERE short_id = :shortId',
    { shortId }
  );
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

module.exports = {
  pool,
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
  createQRCodeWithinLimit,
  updateQRCode,
  deleteQRCode,
  incrementScanCount,
  getUserStats,
  getCollectionsByUserId,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
};
