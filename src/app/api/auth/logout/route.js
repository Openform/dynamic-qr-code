/**
 * POST /api/auth/logout
 *
 * Clear the auth cookie and end the session.
 */

import { clearAuthCookie } from '@/lib/auth';

export async function POST() {
  try {
    await clearAuthCookie();
    return Response.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
