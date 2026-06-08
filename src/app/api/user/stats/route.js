import { getSession } from '@/lib/auth';
const { getUserStats } = require('@/lib/db');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const stats = await getUserStats(session.userId);

    return Response.json({
      totalQRCodes: stats.totalQRCodes,
      totalScans: stats.totalScans,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
