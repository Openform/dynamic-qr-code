/**
 * GET /api/auth/me
 *
 * Return the current authenticated user's info.
 */

import { getSession, isAdminEmail } from '@/lib/auth';
import { getPackage } from '@/lib/packages';
const { getUserById } = require('@/lib/db');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return Response.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const pkg = getPackage(user.package);

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? null,
      // { id, name, limit, schedules, passwords } — limit is null for
      // unlimited packages; schedules and passwords say whether the account
      // can add and edit schedules, and give codes a password.
      package: {
        id: pkg.id,
        name: pkg.name,
        limit: pkg.limit,
        schedules: pkg.schedules,
        passwords: pkg.passwords,
      },
      isAdmin: isAdminEmail(user.email),
    });
  } catch (error) {
    console.error('Me error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
