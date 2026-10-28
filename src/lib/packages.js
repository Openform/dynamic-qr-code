/**
 * Account packages and how many QR codes each one allows.
 *
 * Shared by the API (to enforce limits) and the UI (to show usage), so this
 * file must stay free of server-only imports.
 */

export const PACKAGES = [
  { id: 'starter', name: 'Starter', limit: 5 },
  { id: 'business', name: 'Business', limit: 20 },
  { id: 'extended', name: 'Extended', limit: 50 },
  // `null` means unlimited.
  { id: 'enterprise', name: 'Enterprise', limit: null },
];

/** Package given to accounts created through the public sign-up page. */
export const DEFAULT_PACKAGE = 'starter';

const BY_ID = new Map(PACKAGES.map((p) => [p.id, p]));

export function isValidPackage(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * Look up a package by id. An unknown or missing id falls back to the default
 * package, so a bad value in the database can never grant unlimited codes.
 */
export function getPackage(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_PACKAGE);
}

/** True when an account on this package already has as many codes as it may. */
export function hasReachedLimit(packageId, codeCount) {
  const { limit } = getPackage(packageId);
  return limit !== null && codeCount >= limit;
}

/** Human-readable limit, e.g. "5 codes" or "Unlimited codes". */
export function describeLimit(packageId) {
  const { limit } = getPackage(packageId);
  return limit === null ? 'Unlimited codes' : `${limit} codes`;
}
