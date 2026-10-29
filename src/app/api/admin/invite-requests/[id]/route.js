/**
 * PATCH  /api/admin/invite-requests/[id] — Mark an invite request done, or reopen it
 * DELETE /api/admin/invite-requests/[id] — Permanently delete one (e.g. spam)
 *
 * Admins only (see ADMIN_EMAILS).
 *
 * PATCH body: { handled: boolean }. Returns { request }.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getAdminUser, adminOnlyResponse } from '@/lib/admin';
import { toClientInviteRequest } from '@/lib/inviteRequests';
const { setInviteRequestHandled, deleteInviteRequest } = require('@/lib/db');

const notFound = () => Response.json({ error: 'Invite request not found' }, { status: 404 });

/** The numeric request id from the URL, or null when it isn't one. */
async function readRequestId(params) {
  const { id } = await params;
  const requestId = Number(id);
  return Number.isInteger(requestId) && requestId > 0 ? requestId : null;
}

export async function PATCH(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const requestId = await readRequestId(params);
    if (!requestId) return notFound();

    const body = await request.json().catch(() => null);
    if (typeof body?.handled !== 'boolean') {
      return Response.json({ error: 'handled must be true or false' }, { status: 400 });
    }

    const row = await setInviteRequestHandled(requestId, body.handled, admin.id);
    if (!row) return notFound();

    return Response.json({ request: toClientInviteRequest(row) });
  } catch (error) {
    console.error('Update invite request error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const requestId = await readRequestId(params);
    if (!requestId) return notFound();

    const deleted = await deleteInviteRequest(requestId);
    if (!deleted) return notFound();

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Delete invite request error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
