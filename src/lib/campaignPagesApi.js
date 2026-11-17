/**
 * Server-side helpers shared by the campaign page API routes
 * (/api/pages and /api/pages/[id]). They use the database, so only API
 * routes import this file.
 */

import { canUsePages } from './packages';
import { sqlToIso } from './analyticsFilters';
import { PRIVATE_HEADERS } from './clientQRCode';
import { getUserById } from './db';

/** Sent with every page response: pages are private to their owner. */
export { PRIVATE_HEADERS };

/** Shown when an account's package can't add or edit campaign pages. */
export const PAGES_PACKAGE_ERROR =
  'Campaign pages are available on the Business package and up. Contact us to upgrade your package.';

/**
 * A page in the API shape. `endsAt` is an ISO time (UTC) or null. `content`
 * and `keptButton` are only there when the page was loaded whole.
 */
export function toClientPage(page) {
  const out = {
    id: page.id,
    name: page.name,
    published: page.published,
    takenDown: Boolean(page.takenDownAt),
    endsAt: sqlToIso(page.endsAt),
    afterEnd: page.afterEnd,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
  if ('content' in page) {
    out.content = page.content;
    out.keptButton = page.keptButton ?? null;
  }
  return out;
}

/** The signed-in user's account row, or null. */
export async function loadUser(userId) {
  return getUserById(userId);
}

/** Whether this account's package lets it add and edit pages. */
export function accountCanUsePages(user) {
  return Boolean(user) && canUsePages(user.package);
}

/** The error sent when a package can't add or edit pages. */
export function packageErrorResponse() {
  return Response.json(
    { error: PAGES_PACKAGE_ERROR, code: 'PACKAGE_FEATURE' },
    { status: 403, headers: PRIVATE_HEADERS }
  );
}

/** A failed check from lib/campaignPages.js as a 400, with where the problem is. */
export function invalidPageResponse(checked) {
  return Response.json({ error: checked.error, path: checked.path ?? null }, { status: 400, headers: PRIVATE_HEADERS });
}

/** The request's JSON body, or undefined when it isn't valid JSON. */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
