/**
 * GET /api/analytics — scan analytics for the signed-in user's codes.
 *
 * Query: range (7d | 30d | 90d | 12m | all), tz (browser getTimezoneOffset()),
 * and optionally codeId or collectionId (a number, or "default").
 */

import { getSession } from '@/lib/auth';
import { analyticsResponse } from '@/lib/analyticsApi';

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return await analyticsResponse(request, { userId: session.userId });
  } catch (error) {
    console.error('GET /api/analytics error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
