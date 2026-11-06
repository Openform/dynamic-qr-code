/**
 * Turn a scan request into a scan_events row, and keep the table within the
 * retention period. Called from the public redirect route after the redirect
 * has been sent, so none of this slows down the person scanning.
 */

import { parseUserAgent, isBotUserAgent, parseLanguage } from './userAgent';
import { visitorHash } from './visitor';
import { lookupLocation } from './geo';
import { retentionMonths, retentionCutoff } from './retention';
import { toSqlDateTime } from './analyticsFilters';
import { TRASH_RETENTION_DAYS } from './trash';
import { recordScan, pruneScanEvents, purgeExpiredTrash } from './db';

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastPruneAt = 0;

/**
 * Record a scan of `qrcode` (a qrcodes row) from the request details read in
 * the route: `{ ip, userAgent, acceptLanguage }`. The IP is used for location
 * and the visitor hash, then dropped.
 */
export async function recordScanFromRequest(qrcode, { ip, userAgent, acceptLanguage }) {
  const isBot = isBotUserAgent(userAgent);
  // Bots never appear in charts, so skip the location lookup for them.
  const location = isBot ? {} : await lookupLocation(ip);

  await recordScan({
    qrcodeId: qrcode.id,
    userId: qrcode.user_id,
    ...location,
    ...parseUserAgent(userAgent),
    language: parseLanguage(acceptLanguage),
    visitorHash: isBot ? null : visitorHash(ip, userAgent),
    isBot,
  });
}

/**
 * Housekeeping, at most once a day per process: delete scan rows older than
 * ANALYTICS_RETENTION_MONTHS, and permanently delete codes that have been in
 * Trash longer than TRASH_RETENTION_DAYS. The first scan after a restart
 * triggers it, so no cron job is needed. The two jobs are independent: one
 * failing (or being switched off) never stops the other.
 */
export async function pruneIfDue(nowMs = Date.now()) {
  if (nowMs - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = nowMs;

  try {
    const cutoff = retentionCutoff(nowMs, retentionMonths());
    if (cutoff !== null) {
      const deleted = await pruneScanEvents(toSqlDateTime(cutoff));
      if (deleted > 0) {
        console.log(`Analytics retention: deleted ${deleted} scan rows from before ${toSqlDateTime(cutoff)} UTC`);
      }
    }
  } catch (error) {
    console.error('Scan retention error:', error);
  }

  try {
    const purged = await purgeExpiredTrash({ retentionDays: TRASH_RETENTION_DAYS });
    if (purged > 0) {
      console.log(`Trash: permanently deleted ${purged} codes that had been in Trash over ${TRASH_RETENTION_DAYS} days`);
    }
  } catch (error) {
    console.error('Trash purge error:', error);
  }
}
