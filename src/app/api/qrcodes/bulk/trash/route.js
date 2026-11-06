/**
 * POST /api/qrcodes/bulk/trash — Move codes to Trash.
 *
 * Body: { ids: [number, ...] }
 *
 * The codes stop working at once (their links go to the "not found" page) but
 * can be restored from Trash. Only the signed-in user's own live codes are
 * affected; anything else (someone else's, already in Trash, missing) is
 * skipped rather than failing the request, so it's safe to retry.
 *
 * Responses: 200 { trashed, skipped } · 400 bad ids · 401 · 413
 */

import { getSession } from '@/lib/auth';
import { readJsonBody } from '@/lib/requestBody';
import { validateIdList } from '@/lib/trash';

const { trashQRCodes } = require('@/lib/db');

// 500 ids is a few KB; anything bigger is not a legitimate request.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const checked = validateIdList(parsed.body?.ids);
    if (checked.error) {
      return Response.json({ error: checked.error }, { status: 400 });
    }

    const trashed = await trashQRCodes(session.userId, checked.ids);
    return Response.json({ trashed, skipped: checked.ids.length - trashed });
  } catch (error) {
    console.error('POST /api/qrcodes/bulk/trash error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
