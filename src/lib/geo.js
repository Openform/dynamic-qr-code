/**
 * IP → country / region / city, from a local DB-IP "IP to City Lite" file.
 *
 * The file (data/geoip/dbip-city-lite.mmdb, ~130 MB) is downloaded by
 * `npm run geoip:update` and read into memory once per process, so lookups
 * take microseconds and no scanner IP is ever sent to a third party.
 * It's watched for changes, so a monthly update is picked up without a
 * restart.
 *
 * Location is optional: if the file is missing or unreadable, lookups return
 * nulls and scans are still recorded (shown as "Unknown" on the dashboard).
 *
 * Data licence: CC BY 4.0 — the analytics page must credit
 * "IP Geolocation by DB-IP" with a link to https://db-ip.com.
 */

import path from 'node:path';
import ipaddr from 'ipaddr.js';
import maxmind from 'maxmind';

export const DEFAULT_GEOIP_PATH = path.join(process.cwd(), 'data', 'geoip', 'dbip-city-lite.mmdb');

// After a failed open, wait this long before trying again (e.g. after the
// update script has been run for the first time).
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_NAME_LENGTH = 100; // matches scan_events.region / city

const EMPTY = Object.freeze({ countryCode: null, region: null, city: null });

/**
 * Normalize a client IP for lookup: unwraps IPv4-mapped IPv6
 * ("::ffff:1.2.3.4") and drops a ":port" suffix. Returns null for anything
 * that isn't a public address (private, loopback, CGNAT, invalid…), since
 * those have no location.
 */
export function publicIp(ip) {
  if (typeof ip !== 'string') return null;
  let value = ip.trim();
  const withPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (withPort) value = withPort[1];
  if (!ipaddr.isValid(value)) return null;
  const parsed = ipaddr.process(value);
  return parsed.range() === 'unicast' ? parsed.toString() : null;
}

function englishName(names) {
  const name = names?.en;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME_LENGTH) : null;
}

/** Map a DB-IP / GeoIP2-style city record to the fields we store. */
export function toLocation(record) {
  if (!record) return EMPTY;
  const code = record.country?.iso_code;
  return {
    countryCode: typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : null,
    region: englishName(record.subdivisions?.[0]?.names),
    city: englishName(record.city?.names),
  };
}

/**
 * Create a lookup function bound to one database file. Exported for tests;
 * the app uses `lookupLocation` below.
 */
export function createGeoLookup(filePath) {
  let readerPromise = null;
  let failedAt = 0;
  let warned = false;

  function getReader() {
    if (readerPromise) return readerPromise;
    if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return Promise.resolve(null);

    readerPromise = maxmind
      .open(filePath, { watchForUpdates: true, watchForUpdatesNonPersistent: true })
      .catch((err) => {
        if (!warned) {
          console.warn(
            `GeoIP database not available at ${filePath} — scan locations will be "Unknown". ` +
              'Run `npm run geoip:update` to download it.',
            err.code || err.message
          );
          warned = true;
        }
        failedAt = Date.now();
        readerPromise = null;
        return null;
      });
    return readerPromise;
  }

  return async function lookup(ip) {
    const address = publicIp(ip);
    if (!address) return EMPTY;
    const reader = await getReader();
    if (!reader) return EMPTY;
    try {
      return toLocation(reader.get(address));
    } catch {
      return EMPTY;
    }
  };
}

/** Country code, region and city for an IP, or nulls if unknown. */
export const lookupLocation = createGeoLookup(process.env.GEOIP_DB_PATH || DEFAULT_GEOIP_PATH);
