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
import { recordScan, pruneScanEvents } from './db';

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
 * Delete scan rows older than ANALYTICS_RETENTION_MONTHS, at most once a day
 * per process. The first scan after a restart triggers it, so no cron job is
 * needed.
 */
export async function pruneIfDue(nowMs = Date.now()) {
  if (nowMs - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = nowMs;

  const cutoff = retentionCutoff(nowMs, retentionMonths());
  if (cutoff === null) return;
  const deleted = await pruneScanEvents(toSqlDateTime(cutoff));
  if (deleted > 0) {
    console.log(`Analytics retention: deleted ${deleted} scan rows from before ${toSqlDateTime(cutoff)} UTC`);
  }
}
