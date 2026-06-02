/**
 * Database initialization and helper functions for the QR code generator.
 * Uses better-sqlite3 (CommonJS module) with WAL mode and foreign keys.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize the database
const db = new Database(path.join(dataDir, 'qrcodes.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// ──────────────────────────────────────────────
// Table creation
// ──────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS qrcodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    foreground_color TEXT DEFAULT '#000000',
    background_color TEXT DEFAULT '#ffffff',
    scan_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ──────────────────────────────────────────────
// Indexes
// ──────────────────────────────────────────────

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_qrcodes_short_id ON qrcodes(short_id);
  CREATE INDEX IF NOT EXISTS idx_qrcodes_user_id ON qrcodes(user_id);
`);

// ──────────────────────────────────────────────
// Prepared statements (created once, reused)
// ──────────────────────────────────────────────

const stmts = {
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  createUser: db.prepare(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
  ),
  getQRCodesByUserId: db.prepare(
    'SELECT * FROM qrcodes WHERE user_id = ? ORDER BY created_at DESC'
  ),
  getQRCodeById: db.prepare(
    'SELECT * FROM qrcodes WHERE id = ? AND user_id = ?'
  ),
  getQRCodeByShortId: db.prepare('SELECT * FROM qrcodes WHERE short_id = ?'),
  createQRCode: db.prepare(`
    INSERT INTO qrcodes (short_id, user_id, title, destination_url, foreground_color, background_color)
    VALUES (@shortId, @userId, @title, @destinationUrl, @foregroundColor, @backgroundColor)
  `),
  updateQRCode: db.prepare(`
    UPDATE qrcodes
    SET title = @title,
        destination_url = @destinationUrl,
        foreground_color = @foregroundColor,
        background_color = @backgroundColor,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND user_id = @userId
  `),
  deleteQRCode: db.prepare('DELETE FROM qrcodes WHERE id = ? AND user_id = ?'),
  incrementScanCount: db.prepare(
    'UPDATE qrcodes SET scan_count = scan_count + 1 WHERE short_id = ?'
  ),
  getTotalQRCodes: db.prepare(
    'SELECT COUNT(*) AS count FROM qrcodes WHERE user_id = ?'
  ),
  getTotalScans: db.prepare(
    'SELECT COALESCE(SUM(scan_count), 0) AS total FROM qrcodes WHERE user_id = ?'
  ),
};

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

/** Look up a user by email address. */
function getUserByEmail(email) {
  return stmts.getUserByEmail.get(email) || null;
}

/** Look up a user by ID. */
function getUserById(id) {
  return stmts.getUserById.get(id) || null;
}

/** Create a new user and return the created record. */
function createUser(email, passwordHash, name) {
  const result = stmts.createUser.run(email, passwordHash, name);
  return getUserById(result.lastInsertRowid);
}

/** Get all QR codes belonging to a user, newest first. */
function getQRCodesByUserId(userId) {
  return stmts.getQRCodesByUserId.all(userId);
}

/** Get a single QR code by ID, verifying ownership. Returns null if not found or not owned. */
function getQRCodeById(id, userId) {
  return stmts.getQRCodeById.get(id, userId) || null;
}

/** Get a QR code by its short ID (used for public redirect lookup — no auth check). */
function getQRCodeByShortId(shortId) {
  return stmts.getQRCodeByShortId.get(shortId) || null;
}

/** Create a new QR code record. */
function createQRCode({ shortId, userId, title, destinationUrl, foregroundColor, backgroundColor }) {
  const result = stmts.createQRCode.run({
    shortId,
    userId,
    title,
    destinationUrl,
    foregroundColor: foregroundColor || '#000000',
    backgroundColor: backgroundColor || '#ffffff',
  });
  return stmts.getQRCodeById.get(result.lastInsertRowid, userId);
}

/** Update an existing QR code. Returns the updated record or null if not found/not owned. */
function updateQRCode(id, userId, { title, destinationUrl, foregroundColor, backgroundColor }) {
  const existing = stmts.getQRCodeById.get(id, userId);
  if (!existing) return null;

  stmts.updateQRCode.run({
    id,
    userId,
    title: title ?? existing.title,
    destinationUrl: destinationUrl ?? existing.destination_url,
    foregroundColor: foregroundColor ?? existing.foreground_color,
    backgroundColor: backgroundColor ?? existing.background_color,
  });

  return stmts.getQRCodeById.get(id, userId);
}

/** Delete a QR code. Returns true if a row was deleted, false otherwise. */
function deleteQRCode(id, userId) {
  const result = stmts.deleteQRCode.run(id, userId);
  return result.changes > 0;
}

/** Increment the scan count for a QR code (by short ID). */
function incrementScanCount(shortId) {
  stmts.incrementScanCount.run(shortId);
}

/** Get aggregate stats for a user: total QR codes and total scans. */
function getUserStats(userId) {
  const { count: totalQRCodes } = stmts.getTotalQRCodes.get(userId);
  const { total: totalScans } = stmts.getTotalScans.get(userId);
  return { totalQRCodes, totalScans };
}

module.exports = {
  db,
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
