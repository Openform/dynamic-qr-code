/**
 * POST /api/qrcodes/[id]/destination-changes — change a code's main
 * destination later.
 *
 * Body: `{ destinationUrl, startsAt }`, where `startsAt` is an ISO time with
 * its offset (e.g. from `Date#toISOString()`) in the future. The change is
 * stored as a destination history row that starts then, and takes effect on
 * the first scan after that time. Responds with the code, including its
 * `scheduledChanges`.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { loadClientQRCode } from '@/lib/qrcodeApi';
import { parseScheduledChange, MAX_SCHEDULED_CHANGES } from '@/lib/destinationChanges';
const { scheduleDestinationChange } = require('@/lib/db');

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const codeId = Number(id);
    if (!Number.isInteger(codeId)) {
      return Response.json({ error: 'QR code not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const change = parseScheduledChange(body);
    if (change.error) {
      return Response.json({ error: change.error }, { status: 400 });
    }

    const result = await scheduleDestinationChange(codeId, session.userId, change, MAX_SCHEDULED_CHANGES);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return Response.json({ error: 'QR code not found' }, { status: 404 });
      }
      return Response.json(
        {
          error: `A code can have at most ${MAX_SCHEDULED_CHANGES} changes waiting. Cancel one first.`,
          code: 'SCHEDULED_CHANGE_LIMIT',
        },
        { status: 409 }
      );
    }

    return Response.json({ qrcode: await loadClientQRCode(codeId, session.userId) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/qrcodes/[id]/destination-changes error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
