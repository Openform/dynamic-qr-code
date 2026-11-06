/**
 * POST /api/qrcodes/bulk/purge — Delete codes from Trash for good.
 *
 * Body: { ids: [number, ...] }  or  { all: true } to empty Trash.
 *
 * This cannot be undone: the codes, their scan history and their destination
 * history are removed. It only ever acts on codes that are already in the
 * signed-in user's Trash, so it can't be used to delete a live code, whatever
 * ids it is given — a code has to be moved to Trash first.
 *
 * Responses: 200 { deleted } · 400 bad body · 401 · 413
 */

import { getSession } from '@/lib/auth';
import { readJsonBody } from '@/lib/requestBody';
import { validateIdList } from '@/lib/trash';

const { purgeQRCodes } = require('@/lib/db');

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    // `all` must be exactly `true` (and nothing else sent), so a malformed or
    // truthy-but-wrong body can never be read as "empty the whole Trash".
    if (body?.all !== undefined) {
      if (body.all !== true || body.ids !== undefined) {
        return Response.json(
          { error: 'Send either { ids: [...] } or { all: true }.' },
          { status: 400 }
        );
      }
      const deleted = await purgeQRCodes(session.userId, { all: true });
      return Response.json({ deleted });
    }

    const checked = validateIdList(body?.ids);
    if (checked.error) {
      return Response.json({ error: checked.error }, { status: 400 });
    }
    const deleted = await purgeQRCodes(session.userId, { ids: checked.ids });
    return Response.json({ deleted });
  } catch (error) {
    console.error('POST /api/qrcodes/bulk/purge error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
