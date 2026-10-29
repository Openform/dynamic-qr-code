/**
 * POST /api/admin/invite-alert/test — Send a test invite alert email now
 *
 * Admins only (see ADMIN_EMAILS). Sends straight away, not after the response,
 * so the admin sees exactly what Resend said.
 *
 * Returns { ok: true, id, to }, or { error } with Resend's message.
 */

import { getAdminUser, adminOnlyResponse } from '@/lib/admin';
import { sendTestAlert } from '@/lib/inviteAlert';

export async function POST() {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const result = await sendTestAlert(admin);
    if (!result.ok) {
      console.error('Test invite alert email failed:', result.error);
      return Response.json({ error: result.error }, { status: 502 });
    }
    return Response.json(result);
  } catch (error) {
    console.error('Test invite alert email error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
