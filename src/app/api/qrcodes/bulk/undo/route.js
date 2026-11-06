/**
 * POST /api/qrcodes/bulk/undo — Undo a recent bulk creation.
 *
 * Body: { ids: [number, ...] }  — the ids of the codes the batch created.
 *
 * Deletes those codes, but only ones that belong to the signed-in user AND were
 * created within the last BULK_UNDO_WINDOW_MINUTES. This is deliberately not a
 * general bulk delete: a bug or a stale browser tab can't use it to remove
 * older codes. Anything that doesn't qualify (already deleted, too old) is
 * skipped rather than failing the request.
 *
 * Responses: 200 { deleted, skipped } · 400 bad ids · 401 · 413
 */

import { getSession } from '@/lib/auth';
import { readJsonBody } from '@/lib/requestBody';
import { MAX_BULK_ROWS, BULK_UNDO_WINDOW_MINUTES } from '@/lib/bulk';

const { deleteRecentQRCodes } = require('@/lib/db');

// 200 ids is a few KB; anything bigger is not a legitimate request.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const rawIds = parsed.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return Response.json({ error: 'ids must be a non-empty list.' }, { status: 400 });
    }
    if (rawIds.length > MAX_BULK_ROWS) {
      return Response.json(
        { error: `You can undo at most ${MAX_BULK_ROWS} codes at a time.` },
        { status: 400 }
      );
    }
    if (!rawIds.every((id) => Number.isInteger(id) && id > 0)) {
      return Response.json({ error: 'ids must be positive whole numbers.' }, { status: 400 });
    }

    const ids = [...new Set(rawIds)];
    const deleted = await deleteRecentQRCodes(session.userId, ids, BULK_UNDO_WINDOW_MINUTES);
    return Response.json({ deleted, skipped: ids.length - deleted });
  } catch (error) {
    console.error('POST /api/qrcodes/bulk/undo error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
