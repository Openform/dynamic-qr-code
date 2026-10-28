#!/usr/bin/env node
/**
 * Download the latest DB-IP "IP to City Lite" database for scan locations.
 *
 *   npm run geoip:update
 *
 * Saves to data/geoip/dbip-city-lite.mmdb (or GEOIP_DB_PATH). DB-IP publishes
 * a new file each month; run this monthly, e.g. from an hPanel cron job. The
 * new file is checked before it replaces the old one, and the running app
 * reloads it automatically.
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

const target = process.env.GEOIP_DB_PATH || path.join(process.cwd(), 'data', 'geoip', 'dbip-city-lite.mmdb');
const temp = `${target}.download`;

/** "YYYY-MM" for this month and last month (early in a month the new file may not be out yet). */
function candidateMonths(now = new Date()) {
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return [now.toISOString().slice(0, 7), lastMonth.toISOString().slice(0, 7)];
}

async function download(month) {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
  const res = await fetch(url);
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
