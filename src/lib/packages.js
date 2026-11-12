/**
 * Account packages: how many QR codes each one allows, and whether it can
 * use schedules and password protection.
 *
 * Shared by the API (to enforce limits) and the UI (to show usage), so this
 * file must stay free of server-only imports.
 */

// `yearlyPrice` is in rand, excluding VAT. It's only shown to visitors (the
// landing page and the access request form); the app doesn't bill anyone.
// `schedules`: whether the account can add and edit schedules (date ranges
// and weekly windows that send scans elsewhere). Changing a destination at a
// set time is open to every package.
// `passwords`: whether the account can give a code a password, which people
// must enter after scanning before they're sent on.
export const PACKAGES = [
  { id: 'starter', name: 'Starter', limit: 5, yearlyPrice: 1500, schedules: false, passwords: false },
  { id: 'business', name: 'Business', limit: 20, yearlyPrice: 3000, schedules: true, passwords: true },
  { id: 'extended', name: 'Extended', limit: 50, yearlyPrice: 5000, schedules: true, passwords: true },
  // A `null` limit means unlimited; a `null` price means custom pricing.
  { id: 'enterprise', name: 'Enterprise', limit: null, yearlyPrice: null, schedules: true, passwords: true },
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

/**
 * True when an account on this package can add and edit schedules. Accounts
 * without it can still switch off and delete schedules they already have
 * (e.g. after a downgrade), and those keep working until they do.
 */
export function canUseSchedules(packageId) {
  return getPackage(packageId).schedules === true;
}

/**
 * True when an account on this package can give a code a password or change
 * it. Accounts without it can still remove a password (e.g. after a
 * downgrade), and codes keep asking for theirs until they do.
 */
export function canUsePasswords(packageId) {
  return getPackage(packageId).passwords === true;
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

/** Whole rands as shown to visitors, e.g. 1500 → "R1,500". */
export function formatRand(amount) {
  return `R${amount.toLocaleString('en-US')}`;
}

/** Human-readable price, e.g. "R1,500/year" or "Custom pricing". */
export function describePrice(packageId) {
  const { yearlyPrice } = getPackage(packageId);
  return yearlyPrice === null ? 'Custom pricing' : `${formatRand(yearlyPrice)}/year`;
}
