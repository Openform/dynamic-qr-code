/**
 * PATCH  /api/admin/accounts/[id] — Change an account's package and/or disable it
 * DELETE /api/admin/accounts/[id] — Permanently delete a disabled account
 *
 * Admins only (see ADMIN_EMAILS).
 *
 * PATCH body: { package?, disabled? }
 *   - Downgrading below an account's current number of codes is allowed: its
 *     existing codes keep working, it just can't create new ones until it's
 *     back under the limit.
 *   - disabled: true signs the account out, blocks login and pauses its QR
 *     codes (they show an inactive page). false undoes all of that. Nothing is
 *     deleted either way. Admin accounts can't be disabled.
 *
 * DELETE body: { confirmEmail } — must match the account's email. Removes the
 * account, its QR codes and its collections. The account must be disabled
 * first, and admin accounts can't be deleted.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { isAdminEmail } from '@/lib/auth';
import { getAdminUser, adminOnlyResponse, toClientAccount } from '@/lib/admin';
import { isValidPackage } from '@/lib/packages';
const {
  getUserById,
  updateUserPackage,
  setUserDisabled,
  deleteAccount,
  getAccountById,
} = require('@/lib/db');

const notFound = () => Response.json({ error: 'Account not found' }, { status: 404 });

/** The numeric account id from the URL, or null when it isn't one. */
async function readAccountId(params) {
  const { id } = await params;
  const accountId = Number(id);
  return Number.isInteger(accountId) && accountId > 0 ? accountId : null;
}

// ── PATCH — package and/or disabled ────────────
export async function PATCH(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const accountId = await readAccountId(params);
    if (!accountId) return notFound();

    const body = await request.json();
    const hasPackage = body.package !== undefined;
    const hasDisabled = body.disabled !== undefined;

    if (!hasPackage && !hasDisabled) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }
    if (hasPackage && !isValidPackage(body.package)) {
      return Response.json({ error: 'Unknown package' }, { status: 400 });
    }
    if (hasDisabled && typeof body.disabled !== 'boolean') {
      return Response.json({ error: 'disabled must be true or false' }, { status: 400 });
    }

    const target = await getUserById(accountId);
    if (!target) return notFound();

    // Stops admins locking themselves (or each other) out.
    if (body.disabled === true && (target.id === admin.id || isAdminEmail(target.email))) {
      return Response.json({ error: "Admin accounts can't be disabled" }, { status: 403 });
    }

    if (hasPackage) await updateUserPackage(accountId, body.package);
    if (hasDisabled) await setUserDisabled(accountId, body.disabled);

    const account = await getAccountById(accountId);
    if (!account) return notFound();
    return Response.json({ account: toClientAccount(account) });
  } catch (error) {
    console.error('PATCH /api/admin/accounts/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE — permanently delete ────────────────
export async function DELETE(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const accountId = await readAccountId(params);
    if (!accountId) return notFound();

    const body = await request.json().catch(() => ({}));

    const target = await getUserById(accountId);
    if (!target) return notFound();

    if (target.id === admin.id || isAdminEmail(target.email)) {
      return Response.json({ error: "Admin accounts can't be deleted" }, { status: 403 });
    }

    // A second check on top of the confirmation in the dashboard, so a stray
    // request can't delete the wrong account.
    const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';
    if (confirmEmail !== target.email.trim().toLowerCase()) {
      return Response.json(
        { error: "The email you typed doesn't match this account" },
        { status: 400 }
      );
    }

    const result = await deleteAccount(accountId);
    if (!result.ok) {
      if (result.reason === 'not_disabled') {
        return Response.json(
          { error: 'Disable this account before deleting it' },
          { status: 409 }
        );
      }
      return notFound();
    }

    return Response.json({ deleted: true, id: accountId, deletedCodes: result.deletedCodes });
  } catch (error) {
    console.error('DELETE /api/admin/accounts/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
