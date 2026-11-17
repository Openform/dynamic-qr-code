/**
 * Server-side helpers shared by the QR code API routes. They use the
 * database, so only API routes import this file.
 */

import { toClientQRCode } from './clientQRCode';
import { canUseSchedules, canUsePasswords } from './packages';
import { parseAccessPassword } from './accessPassword';
import { describeSchedules } from './schedules';
import { MAX_SCHEDULES_PER_CODE } from './scheduleInput';
import { pageIdFromReference } from './pageReference';
const { getUserById, getQRCodeById, getScheduledDestinationChanges, getSchedulesForCode, getPageById, getPageNames } = require('./db');

/** Shown when an account's package can't add or edit schedules. */
export const SCHEDULES_PACKAGE_ERROR =
  'Schedules are available on the Business package and up. Contact us to upgrade your package.';

/** Shown when a schedule is added to a code that isn't a website code. */
export const SCHEDULES_TYPE_ERROR = 'Only website codes can have schedules.';

/** Shown when an account's package can't give a code a password. */
export const PASSWORDS_PACKAGE_ERROR =
  'Password protection is available on the Business package and up. Contact us to upgrade your package.';

/** Shown when a destination names a campaign page that isn't one of the account's. */
export const PAGE_DESTINATION_ERROR = 'Choose one of your campaign pages.';

/**
 * Null when `destination` (already checked by lib/contentTypes.js or
 * lib/destinationChanges.js) is fine for this account; otherwise an error to
 * send back. Web links are fine here; a campaign page must be one of the
 * account's own.
 */
export async function pageDestinationProblem(destination, userId) {
  const pageId = pageIdFromReference(destination);
  if (pageId === null) return null;
  if (await getPageById(pageId, userId)) return null;
  return Response.json({ error: PAGE_DESTINATION_ERROR, field: 'url' }, { status: 400 });
}

/** Every campaign page a code in the API shape sends scans to, or might. */
function pageIdsOf(code) {
  const destinations = [
    code.destinationUrl,
    code.liveSchedule?.destinationUrl,
    ...(code.scheduledChanges ?? []).map((change) => change.destinationUrl),
  ];
  return destinations.map(pageIdFromReference).filter((id) => id !== null);
}

/**
 * Codes in the API shape, each with `pageNames` ({ [pageId]: name }) for the
 * campaign pages it sends scans to, so the dashboard can name them.
 */
export async function withPageNames(codes, userId) {
  const names = await getPageNames(codes.flatMap(pageIdsOf), userId);
  return codes.map((code) => ({
    ...code,
    pageNames: Object.fromEntries(pageIdsOf(code).filter((id) => id in names).map((id) => [id, names[id]])),
  }));
}

/**
 * A code in the API shape, with its scheduled destination changes, its
 * schedule summary and the names of the pages it sends scans to, or null
 * when it isn't the user's.
 */
export async function loadClientQRCode(codeId, userId) {
  const code = await getQRCodeById(codeId, userId);
  if (!code) return null;
  const [scheduledChanges, schedules] = await Promise.all([
    getScheduledDestinationChanges(codeId),
    getSchedulesForCode(codeId),
  ]);
  const [withNames] = await withPageNames([toClientQRCode(code, { scheduledChanges, schedules })], userId);
  return withNames;
}

/** Whether this user's package lets them add and edit schedules. */
export async function userCanUseSchedules(userId) {
  const user = await getUserById(userId);
  return Boolean(user) && canUseSchedules(user.package);
}

/**
 * What the schedules panel shows for one code, or null when the code isn't
 * the user's: every schedule (with `status` and `overlapsWith`), the one
 * sending scans now (`liveScheduleId`), whether the user can add and edit
 * schedules, the per-code limit, and the code in the API shape so the
 * dashboard can refresh its card.
 */
export async function loadSchedulesPanel(codeId, userId, canEdit) {
  const qrcode = await loadClientQRCode(codeId, userId);
  if (!qrcode) return null;
  const { schedules, liveScheduleId } = describeSchedules(await getSchedulesForCode(codeId));
  return { schedules, liveScheduleId, canEdit, limit: MAX_SCHEDULES_PER_CODE, qrcode };
}

/**
 * The password a create or edit request asks for, checked. `body` is the
 * request body; `current` is the code's password now (null for a new code or
 * one without). Leaving `accessPassword` out keeps the current one, and null
 * or "" removes it. Removing it, or sending the same one again, is allowed on
 * every package, so an account that has moved down a package can still save
 * its codes; setting or changing one needs a package with passwords.
 *
 * Returns `{ value }` (a string, null to remove, or undefined to leave as it
 * is), or `{ response }`, an error to send back.
 */
export async function accessPasswordFromBody(body, userId, current = null) {
  if (!body || !('accessPassword' in body)) return { value: undefined };

  const parsed = parseAccessPassword(body.accessPassword);
  if (parsed.error) {
    return { response: Response.json({ error: parsed.error }, { status: 400 }) };
  }
  if (parsed.value === null || parsed.value === current) return { value: parsed.value };

  const user = await getUserById(userId);
  if (!user || !canUsePasswords(user.package)) {
    return {
      response: Response.json({ error: PASSWORDS_PACKAGE_ERROR, code: 'PACKAGE_FEATURE' }, { status: 403 }),
    };
  }
  return { value: parsed.value };
}

/** A route parameter as a positive whole number, or null. */
export function idParam(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
