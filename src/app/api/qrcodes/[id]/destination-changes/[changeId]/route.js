/**
 * DELETE /api/qrcodes/[id]/destination-changes/[changeId] — cancel a
 * scheduled change to a code's main destination. Only a change that hasn't
 * started can be cancelled; once it has, it's part of the code's destination
 * history. Responds with the code, including its remaining `scheduledChanges`.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { toClientQRCode } from '@/lib/clientQRCode';
const { getQRCodeById, cancelDestinationChange, getScheduledDestinationChanges } = require('@/lib/db');

export async function DELETE(request, { params }) {
  try {
    const { id, changeId } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const codeId = Number(id);
    const changeNumber = Number(changeId);
    if (!Number.isInteger(codeId) || !Number.isInteger(changeNumber)) {
      return Response.json({ error: 'Scheduled change not found' }, { status: 404 });
    }

    const outcome = await cancelDestinationChange(codeId, session.userId, changeNumber);
    if (outcome === 'not_found') {
      return Response.json({ error: 'Scheduled change not found' }, { status: 404 });
    }
    if (outcome === 'started') {
      return Response.json(
        { error: 'This change has already happened, so it can’t be cancelled.' },
        { status: 409 }
      );
    }

    const qrcode = await getQRCodeById(codeId, session.userId);
    const scheduledChanges = await getScheduledDestinationChanges(codeId);
    return Response.json({ qrcode: toClientQRCode(qrcode, scheduledChanges) });
  } catch (error) {
    console.error('DELETE /api/qrcodes/[id]/destination-changes/[changeId] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
