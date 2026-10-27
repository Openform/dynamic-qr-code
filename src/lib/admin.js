/**
 * Server-side admin check, shared by the admin page and the admin API routes.
 */

import { getSession, isAdminEmail } from '@/lib/auth';
const { getUserById } = require('@/lib/db');

/**
 * Return the signed-in user if they're an admin, otherwise null. The user is
 * re-read from the database on every call, so removing someone from
 * ADMIN_EMAILS takes effect immediately rather than when their session expires.
 */
export async function getAdminUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

/** Standard response for a signed-in user who isn't an admin. */
export function adminOnlyResponse() {
  return Response.json({ error: 'Admin access required' }, { status: 403 });
}

/** Shape an account summary row (see getAllAccounts) for the admin dashboard. */
export function toClientAccount(account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    avatar: account.avatar ?? null,
    package: account.package,
    // When the account was disabled, or null while it's active.
    disabledAt: account.disabledAt ?? null,
    codeCount: account.codeCount,
    scanCount: account.scanCount,
    createdAt: account.createdAt,
    isAdmin: isAdminEmail(account.email),
  };
}
