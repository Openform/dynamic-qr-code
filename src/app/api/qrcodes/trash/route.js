/**
 * GET /api/qrcodes/trash — The signed-in user's codes in Trash.
 *
 * Codes that have been in Trash longer than the retention period are deleted
 * for good first (there is no cron job on shared hosting, so looking at Trash
 * is when it happens for this user). Each code carries `deletedMinutesAgo` and
 * `daysLeft`, worked out by the database, so the client never has to parse a
 * database timestamp.
 */

import { getSession } from '@/lib/auth';
import { TRASH_RETENTION_DAYS } from '@/lib/trash';

const { getTrashedQRCodes, purgeExpiredTrash } = require('@/lib/db');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    await purgeExpiredTrash({ retentionDays: TRASH_RETENTION_DAYS, userId: session.userId });
    const qrcodes = await getTrashedQRCodes(session.userId, TRASH_RETENTION_DAYS);
    return Response.json({ qrcodes, retentionDays: TRASH_RETENTION_DAYS });
  } catch (error) {
    console.error('GET /api/qrcodes/trash error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
