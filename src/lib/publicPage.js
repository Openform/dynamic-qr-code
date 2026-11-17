/**
 * Loading a campaign page for a visitor, at /r/[shortId]/p/[pageId]. A page
 * is only ever shown under a code that links to it, and every visit checks
 * that code again, so the page gets the same protection as the code itself:
 *
 *   1. the code exists and is a website code (only those can point at pages);
 *   2. its owner's account isn't disabled;
 *   3. if it has a password, this browser has entered it (the unlock cookie,
 *      which is only sent to the code's own /r/ path);
 *   4. it links to this page: its main destination, or one of its switched-on
 *      schedules that hasn't ended, is the page (pageReference());
 *   5. the page belongs to the code's owner, is switched on, and hasn't been
 *      taken down.
 *
 * Without 4, any of an account's codes could be put in front of any of its
 * pages, and a page linked from a password-protected code could be opened
 * through one without a password.
 */

import { getQRCodeByShortId, getLiveCandidateSchedules, getPageById } from './db';
import { getContentType } from './contentTypes';
import { isUnlocked } from './unlock';
import { pageReference } from './campaignPages';

const SHORT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const PAGE_ID = /^[1-9][0-9]{0,9}$/;

/** Does this code send scans to the page now, or could a live schedule? */
async function codeLinksToPage(qrcode, pageId) {
  const reference = pageReference(pageId);
  if (qrcode.destination_url === reference) return true;
  const schedules = await getLiveCandidateSchedules(qrcode.id);
  return schedules.some((schedule) => schedule.destinationUrl === reference);
}

/**
 * The page and its code, checked as above: `{ page, qrcode }`. Otherwise
 * `{ reason }` ('not-found', 'inactive' or 'error', as /code-unavailable
 * takes them), or `{ locked: true }` when the visitor still has to enter the
 * code's password. A page that isn't there, isn't linked, is switched off or
 * was taken down is 'not-found', so nothing says which.
 */
export async function loadPublicPage({ shortId, pageId, unlockToken }) {
  if (!SHORT_ID.test(String(shortId ?? '')) || !PAGE_ID.test(String(pageId ?? ''))) {
    return { reason: 'not-found' };
  }
  const id = Number(pageId);
  try {
    const qrcode = await getQRCodeByShortId(shortId);
    if (!qrcode || getContentType(qrcode.content_type).id !== 'url') return { reason: 'not-found' };
    if (qrcode.owner_disabled_at) return { reason: 'inactive' };
    // Before anything about the page, so nobody without the password learns
    // whether it exists.
    if (qrcode.access_password && !(await isUnlocked(unlockToken, qrcode))) return { locked: true };
    if (!(await codeLinksToPage(qrcode, id))) return { reason: 'not-found' };

    const page = await getPageById(id, qrcode.user_id);
    if (!page || !page.published || page.takenDownAt || !page.content) return { reason: 'not-found' };
    return { page, qrcode };
  } catch (error) {
    console.error('Campaign page lookup error:', error);
    return { reason: 'error' };
  }
}
