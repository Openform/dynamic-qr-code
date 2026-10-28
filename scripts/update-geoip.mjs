#!/usr/bin/env node
/**
 * Download the latest DB-IP "IP to City Lite" database for scan locations.
 *
 *   npm run geoip:update        always download the latest file
 *   npm run build               runs this first with --if-stale --no-fail
 *                               (the "prebuild" script), so every deploy has it
 *
 * Options:
 *   --if-stale  skip the download when the file is less than 7 days old
 *   --no-fail   on any error, print a warning and exit successfully, so a
 *               deploy never fails because DB-IP can't be reached. The app
 *               then keeps the old file, or records locations as "Unknown"
 *               if there's none, until the next successful download.
 *
 * Saves to data/geoip/dbip-city-lite.mmdb (or GEOIP_DB_PATH). DB-IP publishes
 * a new file each month. The new file is checked before it replaces the old
 * one, and a running app reloads it automatically.
 *
 * Licence: CC BY 4.0 (https://db-ip.com/db/lite.php). The analytics page
 * shows the required "IP Geolocation by DB-IP" credit.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import maxmind from 'maxmind';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 7;
// Give up on a stuck download rather than hang the build (~60 MB compressed).
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const ifStale = args.has('--if-stale');
const noFail = args.has('--no-fail');

const target = process.env.GEOIP_DB_PATH || path.join(process.cwd(), 'data', 'geoip', 'dbip-city-lite.mmdb');
const temp = `${target}.download`;

/** "YYYY-MM" for this month and last month (early in a month the new file may not be out yet). */
function candidateMonths(now = new Date()) {
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return [now.toISOString().slice(0, 7), lastMonth.toISOString().slice(0, 7)];
}

/** Age of the current file in days, or null if there isn't one. */
async function fileAgeDays(file) {
  try {
    const { mtimeMs } = await stat(file);
    return (Date.now() - mtimeMs) / DAY_MS;
  } catch {
    return null;
  }
}

async function download(month) {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  console.log(`Downloading ${url}`);
  await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(temp));
  return url;
}

/** Make sure the file opens and gives a sensible answer before using it. */
async function check(file) {
  const reader = await maxmind.open(file);
  const country = reader.get('8.8.8.8')?.country?.iso_code;
  if (country !== 'US') throw new Error(`Downloaded database looks wrong (8.8.8.8 → ${country})`);
}

async function main() {
  if (ifStale) {
    const age = await fileAgeDays(target);
    if (age !== null && age < MAX_AGE_DAYS) {
      console.log(`GeoIP database is up to date (${Math.floor(age)} days old), skipping download: ${target}`);
      return;
    }
  }

  await mkdir(path.dirname(target), { recursive: true });
  try {
    let url = null;
    for (const month of candidateMonths()) {
      url = await download(month);
      if (url) break;
    }
    if (!url) throw new Error('No DB-IP City Lite file found for this month or last month');

    await check(temp);
    await rename(temp, target);
    const { size } = await stat(target);
    console.log(`Saved ${target} (${(size / 1024 / 1024).toFixed(0)} MB)`);
  } finally {
    await rm(temp, { force: true });
  }
}

main().catch(async (error) => {
  const message = error.name === 'TimeoutError' ? 'download timed out' : error.message;
  if (!noFail) {
    console.error(message);
    process.exitCode = 1;
    return;
  }
  const hasFile = (await fileAgeDays(target)) !== null;
  console.warn(
    `Warning: could not update the GeoIP database (${message}). ` +
      (hasFile
        ? 'Keeping the existing file.'
        : 'Scan locations will show as "Unknown" until it is downloaded (npm run geoip:update).')
  );
});
