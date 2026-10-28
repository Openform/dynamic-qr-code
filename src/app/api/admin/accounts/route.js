/**
 * GET  /api/admin/accounts — List every account with its package and usage
 * POST /api/admin/accounts — Create an account for a client on a chosen package
 *
 * Admins only (see ADMIN_EMAILS). Body for POST: { name, email, password, package }
 */

import { hashPassword } from '@/lib/auth';
import { getAdminUser, adminOnlyResponse, toClientAccount } from '@/lib/admin';
import { validateNewAccount } from '@/lib/accounts';
import { isValidPackage } from '@/lib/packages';
const { getAllAccounts, getAccountById, getUserByEmail, createUser } = require('@/lib/db');

// ── GET — list accounts ────────────────────────
export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const accounts = await getAllAccounts();
    return Response.json({ accounts: accounts.map(toClientAccount) });
  } catch (error) {
    console.error('GET /api/admin/accounts error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST — create account ──────────────────────
export async function POST(request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const body = await request.json();

    const fields = validateNewAccount(body);
    if (fields.error) {
      return Response.json({ error: fields.error }, { status: 400 });
    }
    if (!isValidPackage(body.package)) {
      return Response.json({ error: 'Choose a package for this account' }, { status: 400 });
    }

    const existing = await getUserByEmail(fields.email);
    if (existing) {
      return Response.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Unlike public sign-up, this does NOT log the admin in as the new account.
    const passwordHash = await hashPassword(fields.password);
    const user = await createUser(fields.email, passwordHash, fields.name, body.package);
    const account = await getAccountById(user.id);

    return Response.json({ account: toClientAccount(account) }, { status: 201 });
  } catch (error) {
    // Two admins creating the same email at once can still hit the unique key.
    if (error?.code === 'ER_DUP_ENTRY') {
      return Response.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }
    console.error('POST /api/admin/accounts error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
