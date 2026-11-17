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

/** Where a page's image is shown to visitors, under the code and page (it checks both again). */
export function pageImagePath(shortId, pageId, image) {
  return `${pagePath(shortId, pageId)}/i/${image.id}-${image.hash}`;
}

/** Where the page's owner loads an image, for the editor and the preview. */
export function ownerImagePath(pageId, image) {
  return `/api/pages/${pageId}/images/${image.id}-${image.hash}`;
}

/** Where a visitor downloads a calendar or contact button's file (`type` is 'ics' or 'vcf'). */
export function pageFilePath(shortId, pageId, buttonId, type) {
  return `${pagePath(shortId, pageId)}/f/${buttonId}.${type}`;
}

/** Where the page's owner downloads one, from the saved page, for the editor and the preview. */
export function ownerFilePath(pageId, buttonId, type) {
  return `/api/pages/${pageId}/files/${buttonId}.${type}`;
}

/** "Report this page": a form under the page's own path, so it checks the code and page like the page does. */
export function pageReportPath(shortId, pageId) {
  return `${pagePath(shortId, pageId)}/report`;
}

/** Where admins see any account's page, from the reports screen. */
export function adminPagePath(pageId) {
  return `/admin/pages/${pageId}`;
}

/** Where admins load a page's image, for that view. */
export function adminImagePath(pageId, image) {
  return `/api/admin/pages/${pageId}/images/${image.id}-${image.hash}`;
}

/** `{ [imageId]: { src, width, height } }` for the page component, from a page's images. */
export function imagesFor(images, srcOf) {
  return Object.fromEntries((images ?? []).map((image) => [image.id, { src: srcOf(image), width: image.width, height: image.height }]));
}
