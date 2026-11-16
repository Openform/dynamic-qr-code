/**
 * Shared handlers behind the analytics API routes:
 *   /api/analytics(/export)        a signed-in user's own codes
 *   /api/admin/analytics(/export)  every account (admins only)
 * The routes do the auth check and pass in who's asking.
 */

import { parseAnalyticsFilters, computePeriods, RANGES } from './analyticsFilters';
import { getScanAnalytics, scanEventBatches, resolveDestinationFilter } from './scanAnalytics';
import { retentionMonths } from './retention';
import { csvRow } from './csv';
import { getQRCodeById, getCollectionById, getPageNames } from './db';
import { pageIdFromReference } from './pageReference';
import { describeDestination } from './contentTypes';

function badRequest(error) {
  return Response.json({ error }, { status: 400 });
}

function notFound(error) {
  return Response.json({ error }, { status: 404 });
}

/**
 * Validate the query string and work out which scans to include. For a user,
 * a requested code or collection must be theirs. For an admin, the scope is
 * every account, or one via `accountId`, optionally narrowed to any code.
 * Either can narrow a code to one of its destinations.
 * Returns `{ filters, scope }` or `{ response }` (an error to send back).
 */
async function resolveScope(request, { userId, admin }) {
  const filters = parseAnalyticsFilters(new URL(request.url).searchParams);
  if (filters.error) return { response: badRequest(filters.error) };

  let scope;
  if (admin) {
    scope = { userId: filters.accountId, codeId: filters.codeId };
  } else {
    if (filters.codeId !== null && !(await getQRCodeById(filters.codeId, userId))) {
      return { response: notFound('QR code not found') };
    }
    if (typeof filters.collectionId === 'number' && !(await getCollectionById(filters.collectionId, userId))) {
      return { response: notFound('Collection not found') };
    }
    scope = { userId, codeId: filters.codeId, collectionId: filters.collectionId };
  }

  if (filters.destination) {
    const destination = await resolveDestinationFilter(filters.codeId, filters.destination);
    if (!destination) return { response: notFound('Destination not found') };
    scope.destination = destination;
  }
  return { filters, scope };
}

/** GET handler body: every dashboard panel as JSON. */
export async function analyticsResponse(request, { userId = null, admin = false }) {
  const { filters, scope, response } = await resolveScope(request, { userId, admin });
  if (response) return response;

  const data = await getScanAnalytics({
    scope,
    range: filters.range,
    offsetMinutes: filters.offsetMinutes,
    admin,
  });
  if (!data) return notFound('QR code not found');
  // Campaign pages a code sent scans to, named for the Destinations card.
  if (data.destinations) {
    const ids = [...pageIdsIn(data.destinations)];
    data.destinations = { ...data.destinations, pageNames: await getPageNames(ids, admin ? null : userId) };
  }
  return Response.json({ ...data, retentionMonths: retentionMonths() });
}

/** Every campaign page id named by a destination string anywhere in `value`. */
function pageIdsIn(value, ids = new Set()) {
  if (typeof value === 'string') {
    const id = pageIdFromReference(value);
    if (id !== null) ids.add(id);
  } else if (Array.isArray(value)) {
    for (const item of value) pageIdsIn(item, ids);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) pageIdsIn(item, ids);
  }
  return ids;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(code) {
  if (!code) return null;
  try {
    return regionNames.of(code);
  } catch {
    return code;
  }
}

/** GET handler body: the scans in the selected range as a CSV download. */
export async function analyticsCsvResponse(request, { userId = null, admin = false }) {
  const { filters, scope, response } = await resolveScope(request, { userId, admin });
  if (response) return response;

  // 'all' exports everything; other ranges match what the dashboard shows.
  const periods =
    RANGES[filters.range].days === null
      ? { from: null, to: null }
      : computePeriods(filters.range, Date.now(), filters.offsetMinutes);

  // Destination and Schedule come last, so spreadsheets built on the earlier
  // columns keep working. An empty Schedule means the main destination.
  const header = [
    'Scanned at (UTC)', 'QR code', 'Short ID', 'Country code', 'Country', 'Region', 'City',
    'Device', 'OS', 'Browser', 'Language',
    ...(admin ? ['Account name', 'Account email'] : []),
    'Destination', 'Schedule',
  ];
  // A campaign page is written as "Campaign page: <name>"; names are looked
  // up batch by batch, as pages appear.
  const pageNames = {};
  const destinationText = (url) =>
    pageIdFromReference(url) === null ? url : describeDestination(url, pageNames);
  const toLine = (r) =>
    csvRow([
      r.scannedAt, r.codeTitle, r.shortId, r.countryCode, countryName(r.countryCode), r.region, r.city,
      r.deviceType, r.os, r.browser, r.language,
      ...(admin ? [r.ownerName, r.ownerEmail] : []),
      destinationText(r.destinationUrl), r.scheduleLabel,
    ]);

  const encoder = new TextEncoder();
  const batches = scanEventBatches({ scope, from: periods.from, to: periods.to, admin });
  const stream = new ReadableStream({
    start(controller) {
      // The byte-order mark makes Excel read the file as UTF-8 (city names).
      controller.enqueue(encoder.encode(`﻿${csvRow(header)}`));
    },
    async pull(controller) {
      try {
        const { value, done } = await batches.next();
        if (done) {
          controller.close();
          return;
        }
        const missing = value.map((r) => pageIdFromReference(r.destinationUrl)).filter((id) => id !== null && !(id in pageNames));
        if (missing.length > 0) Object.assign(pageNames, await getPageNames(missing, admin ? null : userId));
        controller.enqueue(encoder.encode(value.map(toLine).join('')));
      } catch (error) {
        console.error('Analytics export error:', error);
        controller.error(error);
      }
    },
    async cancel() {
      await batches.return();
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="qr-go-scans-${filters.range}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
