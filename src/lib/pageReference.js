/**
 * How a code's main destination, a scheduled change or a schedule points at
 * a campaign page (lib/campaignPages.js): "qrgo-page:<id>", stored in the
 * same destination_url columns as web links, so destination history,
 * schedules and scans per destination work for pages unchanged. The scan
 * route sends such a scan to the page's path under the code (pagePath), so
 * it works on every domain the app is served from.
 *
 * The API only accepts a reference to one of the account's own pages
 * (pageDestinationProblem in lib/qrcodeApi.js).
 *
 * Kept in its own file, with no imports, because the destination checks
 * (lib/contentTypes.js, lib/destinationChanges.js) and the page rules both
 * need it. Shared by the server and the browser.
 */

export const PAGE_REFERENCE_PREFIX = 'qrgo-page:';
const PAGE_REFERENCE = /^qrgo-page:([1-9][0-9]{0,9})$/;

/** The destination value that points at a page. */
export function pageReference(pageId) {
  return `${PAGE_REFERENCE_PREFIX}${pageId}`;
}

/** The page id in a destination value, or null when it isn't a page reference. */
export function pageIdFromReference(value) {
  const match = typeof value === 'string' ? value.match(PAGE_REFERENCE) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Where a page is shown: under the code that links to it, so the page can
 * check that code (and its password) on every visit.
 */
export function pagePath(shortId, pageId) {
  return `/r/${encodeURIComponent(shortId)}/p/${pageId}`;
}

/** The owner's preview of a page, in the dashboard. */
export function pagePreviewPath(pageId) {
  return `/dashboard/pages/${pageId}/preview`;
}
