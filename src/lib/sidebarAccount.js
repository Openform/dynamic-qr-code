/**
 * What the sidebar on the signed-in screens shows about the account (see
 * app/components/shell/AppShell.js), loaded on the server by the /dashboard
 * and /admin layouts.
 */

import { unstable_rethrow } from 'next/navigation';
import { getSession, isAdminEmail } from '@/lib/auth';
import { countOpenInviteRequests, countPagesWithOpenReports, getUserById } from '@/lib/db';

/**
 * `{ user: { name, avatar, isAdmin }, adminCounts }`, where adminCounts is
 * the open `{ invites, reports }` for admins (null for everyone else), or
 * `{ signedOut: true }`. If the database can't be reached the user is null,
 * so the sidebar still shows: the screen itself says what went wrong.
 */
export async function loadSidebarAccount() {
  try {
    const session = await getSession();
    if (!session) return { signedOut: true };
    const user = await getUserById(session.userId);
    if (!user) return { signedOut: true };

    const isAdmin = isAdminEmail(user.email);
    let adminCounts = null;
    if (isAdmin) {
      const [invites, reports] = await Promise.all([countOpenInviteRequests(), countPagesWithOpenReports()]);
      adminCounts = { invites, reports };
    }
    return { user: { name: user.name, avatar: user.avatar ?? null, isAdmin }, adminCounts };
  } catch (error) {
    // Next's own signals (reading the sign-in cookie makes the screen render
    // per request) pass through; only real failures are caught.
    unstable_rethrow(error);
    console.error("Couldn't load the sidebar's account details:", error);
    return { user: null, adminCounts: null };
  }
}
