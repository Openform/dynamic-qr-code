/**
 * GET /api/admin/analytics — scan analytics across every account.
 *
 * Admins only (see ADMIN_EMAILS). Query: range, tz, and optionally accountId
 * to look at one account.
 */

import { getAdminUser, adminOnlyResponse } from '@/lib/admin';
import { analyticsResponse } from '@/lib/analyticsApi';

export async function GET(request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();
    return await analyticsResponse(request, { admin: true });
  } catch (error) {
    console.error('GET /api/admin/analytics error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
