/**
 * GET /api/admin/analytics/export — scans across every account as a CSV file,
 * with each code's owner. Admins only. Same query as /api/admin/analytics.
 */

import { getAdminUser, adminOnlyResponse } from '@/lib/admin';
import { analyticsCsvResponse } from '@/lib/analyticsApi';

export async function GET(request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();
    return await analyticsCsvResponse(request, { admin: true });
  } catch (error) {
    console.error('GET /api/admin/analytics/export error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
