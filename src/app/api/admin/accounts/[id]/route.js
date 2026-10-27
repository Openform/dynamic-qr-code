/**
 * PATCH /api/admin/accounts/[id] — Change an account's package (upgrade/downgrade)
 *
 * Admins only (see ADMIN_EMAILS). Body: { package }
 *
 * Downgrading below an account's current number of codes is allowed: its
 * existing codes keep working, it just can't create new ones until it's back
 * under the limit.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getAdminUser, adminOnlyResponse, toClientAccount } from '@/lib/admin';
import { isValidPackage } from '@/lib/packages';
const { updateUserPackage, getAccountById } = require('@/lib/db');

export async function PATCH(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const { id } = await params;
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    const body = await request.json();
    if (!isValidPackage(body.package)) {
      return Response.json({ error: 'Unknown package' }, { status: 400 });
    }

    const updated = await updateUserPackage(accountId, body.package);
    if (!updated) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    const account = await getAccountById(accountId);
    return Response.json({ account: toClientAccount(account) });
  } catch (error) {
    console.error('PATCH /api/admin/accounts/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
