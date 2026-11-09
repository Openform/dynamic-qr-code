/**
 * Sample rows for the database migration check (check-migrations.mjs).
 *
 * The values are chosen to catch a migration that loses or changes data:
 * a 2,048-character URL (the column's full width), large LONGTEXT and
 * MEDIUMTEXT values, emoji and accented text (utf8mb4), the largest value an
 * INT UNSIGNED holds, NULLs, and scans on both sides of the prune cutoff.
 *
 * Tables are listed parents first, so foreign keys are satisfied. A column
 * that doesn't exist in the starting schema is left out of the insert.
 * Everything here is made up: never put real customer data in this file.
 */

const URL_PREFIX = 'https://example.com/';
export const LONG_URL = URL_PREFIX + 'a'.repeat(2048 - URL_PREFIX.length);

const BIG_STYLE_CONFIG = JSON.stringify({
  codeType: 'qr',
  dots: { type: 'rounded', gradient: { type: 'linear', rotation: 45, colorStops: ['#112233', '#445566'] } },
  cornersSquare: { type: 'extra-rounded', color: '#000000' },
  label: 'Café menu ☕ — 50% off 🎉',
  image: 'data:image/png;base64,' + 'B'.repeat(100_000),
});

/** Scans before this time are deleted by pruneScanEvents(); later ones stay. */
export const PRUNE_CUTOFF = '2024-01-01 00:00:00';

/** The sample scans dated before PRUNE_CUTOFF. */
export const OLD_SCAN_IDS = [1, 2, 3];

export const SEED = {
  users: [
    {
      id: 1,
      email: 'owner@example.com',
      password_hash: '$2b$10$' + 'a'.repeat(53),
      name: 'Ada Owner',
      avatar: 'data:image/png;base64,' + 'A'.repeat(70_000),
      package: 'business',
      disabled_at: null,
      created_at: '2024-03-01 09:00:00',
    },
    {
      id: 2,
      email: 'second@example.com',
      password_hash: '$2b$10$' + 'b'.repeat(53),
      name: 'Zoë Ñandú 😀',
      avatar: null,
      package: 'enterprise',
      disabled_at: null,
      created_at: '2025-02-28 23:59:59',
    },
    {
      id: 3,
      email: 'disabled@example.com',
      password_hash: '$2b$10$' + 'c'.repeat(53),
      name: 'Disabled Account',
      avatar: null,
      package: 'starter',
      disabled_at: '2025-06-01 12:00:00',
      created_at: '2024-01-10 08:00:00',
    },
  ],

  collections: [
    { id: 1, user_id: 1, name: 'Spring menu 🌸', created_at: '2024-03-02 10:00:00', updated_at: '2024-03-05 10:00:00' },
    { id: 2, user_id: 1, name: 'Events', created_at: '2024-04-01 10:00:00', updated_at: '2024-04-01 10:00:00' },
  ],

  qrcodes: [
    {
      id: 1,
      short_id: 'abc123',
      user_id: 1,
      collection_id: 1,
      title: 'Menu — table cards ☕',
      destination_url: LONG_URL,
      foreground_color: '#112233',
      background_color: '#ffffff',
      logo_url: 'https://example.com/logo.png',
      dot_style: 'rounded',
      corner_square_style: 'extra-rounded',
      corner_dot_style: 'dot',
      style_config: BIG_STYLE_CONFIG,
      scan_count: 4294967295,
      created_at: '2024-03-01 09:00:00',
      updated_at: '2026-10-01 08:00:00',
    },
    {
      id: 2,
      short_id: 'xyz789',
      user_id: 1,
      collection_id: null,
      title: 'Plain code',
      destination_url: 'example.org/no-scheme',
      foreground_color: '#000000',
      background_color: '#ffffff',
      logo_url: null,
      dot_style: 'square',
      corner_square_style: 'square',
      corner_dot_style: 'square',
      style_config: null,
      scan_count: 0,
      created_at: '2024-05-01 09:00:00',
      updated_at: '2024-05-01 09:00:00',
    },
    {
      id: 3,
      short_id: 'disabled1',
      user_id: 3,
      collection_id: null,
      title: 'Owner disabled',
      destination_url: 'https://example.net/',
      scan_count: 7,
      created_at: '2024-01-11 08:00:00',
      updated_at: '2024-01-11 08:00:00',
    },
    {
      id: 4,
      short_id: 'emoji1',
      user_id: 2,
      collection_id: null,
      title: '😀 Emoji title — ünïcödé',
      destination_url: 'https://example.com/ñ?q=😀',
      scan_count: 12,
      created_at: '2025-03-01 09:00:00',
      updated_at: '2025-03-01 09:00:00',
    },
  ],

  scan_events: [
    // Before PRUNE_CUTOFF: pruned.
    { id: 1, qrcode_id: 1, user_id: 1, scanned_at: '2020-01-15 10:00:00', country_code: 'ZA', region: 'Western Cape', city: 'Cape Town', device_type: 'mobile', os: 'iOS', browser: 'Safari', language: 'en', visitor_hash: '0123456789abcdef', is_bot: 0 },
    { id: 2, qrcode_id: 1, user_id: 1, scanned_at: '2021-06-30 23:59:59', country_code: null, region: null, city: null, device_type: null, os: null, browser: null, language: null, visitor_hash: null, is_bot: 0 },
    { id: 3, qrcode_id: 2, user_id: 1, scanned_at: '2023-12-31 23:59:59', country_code: 'DE', region: 'Bayern', city: 'München', device_type: 'desktop', os: 'Windows', browser: 'Chrome', language: 'de', visitor_hash: 'fedcba9876543210', is_bot: 1 },
    // Exactly on the cutoff: kept (the delete is strictly "before").
    { id: 4, qrcode_id: 1, user_id: 1, scanned_at: '2024-01-01 00:00:00', country_code: 'ZA', region: 'Gauteng', city: 'Johannesburg', device_type: 'mobile', os: 'Android', browser: 'Chrome', language: 'af', visitor_hash: '1111111111111111', is_bot: 0 },
    // After the cutoff: kept.
    { id: 5, qrcode_id: 1, user_id: 1, scanned_at: '2026-10-01 08:30:00', country_code: 'BR', region: 'São Paulo', city: 'São Paulo', device_type: 'tablet', os: 'iPadOS', browser: 'Safari', language: 'pt', visitor_hash: '2222222222222222', is_bot: 0, destination_url: LONG_URL, schedule_id: 4294967295 },
    { id: 6, qrcode_id: 3, user_id: 3, scanned_at: '2026-11-01 12:00:00', country_code: 'US', region: 'California', city: 'San José', device_type: 'desktop', os: 'macOS', browser: 'Firefox', language: 'en', visitor_hash: '3333333333333333', is_bot: 1 },
    { id: 7, qrcode_id: 4, user_id: 2, scanned_at: '2026-11-08 18:45:00', country_code: 'JP', region: 'Tokyo', city: '東京', device_type: 'mobile', os: 'iOS', browser: 'Safari', language: 'ja', visitor_hash: '4444444444444444', is_bot: 0, destination_url: 'https://example.com/メニュー', schedule_id: null },
  ],

  qrcode_destinations: [
    { id: 1, qrcode_id: 1, destination_url: 'https://example.com/old-menu', started_at: '2024-03-01 09:00:00' },
    { id: 2, qrcode_id: 1, destination_url: LONG_URL, started_at: '2026-10-01 08:00:00' },
  ],

  qrcode_schedules: [
    {
      id: 1,
      qrcode_id: 1,
      label: 'Black Friday 🛍️ — Café',
      kind: 'range',
      destination_url: LONG_URL,
      time_zone: 'Africa/Johannesburg',
      starts_at: '2026-11-27 22:00:00',
      ends_at: '2026-11-30 22:00:00',
      days: null,
      start_time: null,
      end_time: null,
      position: 0,
      enabled: 1,
      created_at: '2026-11-01 08:00:00',
      updated_at: '2026-11-01 08:00:00',
    },
    {
      id: 2,
      qrcode_id: 1,
      label: 'B'.repeat(100),
      kind: 'weekly',
      destination_url: 'https://example.com/breakfast',
      time_zone: 'America/Argentina/ComodRivadavia',
      starts_at: null,
      ends_at: null,
      days: 127,
      start_time: '07:00:00',
      end_time: '23:59:00',
      position: 4294967295,
      enabled: 0,
      created_at: '2026-11-02 08:00:00',
      updated_at: '2026-11-03 08:00:00',
    },
  ],

  legal_pages: [
    {
      slug: 'privacy',
      content: '# Privacy policy 🔒\n\n| Data | Kept |\n| --- | --- |\n| Scans | 24 months |\n\n' + 'Ünïcödé text. '.repeat(5_000),
      last_updated: '2026-10-01',
      updated_at: '2026-10-01 10:00:00',
      updated_by: 1,
    },
  ],

  invite_requests: [
    { id: 1, name: 'Ngozi Adébáyọ̀', email: 'ngozi@example.com', company: 'Café Ltd', phone: '+27 82 000 0000', package: 'business', created_at: '2026-10-20 14:00:00', handled_at: null, handled_by: null },
    { id: 2, name: 'Handled Request', email: 'handled@example.com', company: null, phone: null, package: null, created_at: '2026-09-01 09:00:00', handled_at: '2026-09-02 10:00:00', handled_by: 1 },
  ],
};
