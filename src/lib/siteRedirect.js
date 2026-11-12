/**
 * Redirects from a route handler to another page on this site.
 *
 * Don't build these from `request.url`: in a route handler it's the address
 * the server listens on — http://0.0.0.0:3000 behind Hostinger's proxy — not
 * the one the visitor used, so an absolute URL made from it sends phones to
 * 0.0.0.0. (src/proxy.js is fine: Next.js builds its URL from the request's
 * Host and turns same-site redirects into relative ones.)
 *
 * Instead the Location header is just the path ("/r/abc/open"), which the
 * browser resolves against the address it's already on (RFC 9110 allows a
 * relative Location). That works on every domain the app is served from —
 * production, staging and Hostinger's preview sites — without trusting proxy
 * headers or BASE_URL.
 */

import { NextResponse } from 'next/server';

/**
 * True for a path on this site ("/…"). Not "//host/…", which browsers read
 * as another site, and not a backslash, which some browsers treat the same.
 */
export function isSitePath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

/** A redirect to a path on this site (302 unless `status` says otherwise). */
export function redirectToSitePath(path, status = 302) {
  if (!isSitePath(path)) throw new Error(`Not a path on this site: ${path}`);
  return new NextResponse(null, { status, headers: { Location: path } });
}
