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
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qrcodes (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      short_id VARCHAR(32) NOT NULL UNIQUE,
      user_id INT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      destination_url VARCHAR(2048) NOT NULL,
      foreground_color VARCHAR(32) NOT NULL DEFAULT '#000000',
      background_color VARCHAR(32) NOT NULL DEFAULT '#ffffff',
      logo_url VARCHAR(2048) NULL,
      dot_style VARCHAR(32) NOT NULL DEFAULT 'square',
      corner_square_style VARCHAR(32) NOT NULL DEFAULT 'square',
      corner_dot_style VARCHAR(32) NOT NULL DEFAULT 'square',
      scan_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_qrcodes_user_id (user_id),
      CONSTRAINT fk_qrcodes_user FOREIGN KEY (user_id) REFERENCES users(id)
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
  ];

  for (const [name, clause] of additions) {
    if (!columns.has(name)) {
      await pool.query(`ALTER TABLE qrcodes ${clause}`);
    }
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

/** Create a new user and return the created record. */
async function createUser(email, passwordHash, name) {
  await ensureSchema();
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, name) VALUES (:email, :passwordHash, :name)',
    { email, passwordHash, name }
  );
  return getUserById(result.insertId);
}

/** Get all QR codes belonging to a user, newest first (camelCase keys). */
async function getQRCodesByUserId(userId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    `SELECT
       id,
       short_id AS shortId,
       user_id AS userId,
       title,
       destination_url AS destinationUrl,
       foreground_color AS fgColor,
       background_color AS bgColor,
       logo_url AS logoUrl,
       dot_style AS dotStyle,
       corner_square_style AS cornerSquareStyle,
       corner_dot_style AS cornerDotStyle,
       scan_count AS scanCount,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM qrcodes
     WHERE user_id = :userId
     ORDER BY created_at DESC`,
    { userId }
  );
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

/** Get a QR code by its short ID (used for public redirect lookup — no auth check). */
async function getQRCodeByShortId(shortId) {
  await ensureSchema();
  const [rows] = await pool.execute(
    'SELECT * FROM qrcodes WHERE short_id = :shortId LIMIT 1',
    { shortId }
  );
  return rows[0] || null;
}

/** Create a new QR code record. */
async function createQRCode({ shortId, userId, title, destinationUrl, foregroundColor, backgroundColor, logoUrl, dotStyle, cornerSquareStyle, cornerDotStyle }) {
  await ensureSchema();
  const [result] = await pool.execute(
    `INSERT INTO qrcodes
       (short_id, user_id, title, destination_url, foreground_color, background_color, logo_url, dot_style, corner_square_style, corner_dot_style)
     VALUES
       (:shortId, :userId, :title, :destinationUrl, :foregroundColor, :backgroundColor, :logoUrl, :dotStyle, :cornerSquareStyle, :cornerDotStyle)`,
    {
      shortId,
      userId,
      title,
      destinationUrl,
      foregroundColor: foregroundColor || '#000000',
      backgroundColor: backgroundColor || '#ffffff',
      logoUrl: logoUrl || null,
      dotStyle: dotStyle || 'square',
      cornerSquareStyle: cornerSquareStyle || 'square',
      cornerDotStyle: cornerDotStyle || 'square',
    }
  );
  return getQRCodeById(result.insertId, userId);
}

/** Update an existing QR code. Returns the updated record or null if not found/not owned. */
async function updateQRCode(id, userId, { title, destinationUrl, foregroundColor, backgroundColor, logoUrl, dotStyle, cornerSquareStyle, cornerDotStyle }) {
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
  getQRCodesByUserId,
  getQRCodeById,
  getQRCodeByShortId,
  createQRCode,
  updateQRCode,
  deleteQRCode,
  incrementScanCount,
  getUserStats,
};
