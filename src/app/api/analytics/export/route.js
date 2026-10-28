/**
 * GET /api/analytics/export — the signed-in user's scans as a CSV file.
 * Takes the same query as /api/analytics.
 */

import { getSession } from '@/lib/auth';
import { analyticsCsvResponse } from '@/lib/analyticsApi';

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return await analyticsCsvResponse(request, { userId: session.userId });
  } catch (error) {
    console.error('GET /api/analytics/export error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
