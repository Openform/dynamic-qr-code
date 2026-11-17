/**
 * PATCH /api/admin/pages/[id] — an admin acting on any account's campaign
 * page, from /admin/reports. Body: { action }, one of:
 *   "take-down"      visitors get "not found" and its open reports are closed
 *   "restore"        visitors see it again (if its owner has it switched on)
 *   "close-reports"  close its open reports and leave the page as it is
 *
 * Returns { reports }: the page's reports, as the reports screen lists them.
 * Admins only (see ADMIN_EMAILS).
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { adminOnlyResponse, getAdminUser } from '@/lib/admin';
import { PAGE_ACTIONS } from '@/lib/pageReports';
import { idParam } from '@/lib/qrcodeApi';
import { actOnPage, getPageReports } from '@/lib/db';

const notFound = () => Response.json({ error: 'Page not found' }, { status: 404 });

export async function PATCH(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const pageId = idParam((await params).id);
    if (!pageId) return notFound();

    const body = await request.json().catch(() => null);
    if (!PAGE_ACTIONS.includes(body?.action)) {
      return Response.json({ error: `action must be one of: ${PAGE_ACTIONS.join(', ')}` }, { status: 400 });
    }

    if (!(await actOnPage(pageId, body.action, admin.id))) return notFound();
    return Response.json({ reports: await getPageReports({ pageId }) });
  } catch (error) {
    console.error('Admin page action error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
