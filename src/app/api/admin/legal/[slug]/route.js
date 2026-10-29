/**
 * PUT /api/admin/legal/[slug] — Save the text of a legal page
 *
 * Admins only (see ADMIN_EMAILS). slug is 'privacy' or 'terms'.
 * Body: { content, lastUpdated } — content uses the formatting in
 * lib/markdown.js; lastUpdated ("YYYY-MM-DD") is the date shown on the page.
 * The change is live as soon as this returns.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getAdminUser, adminOnlyResponse } from '@/lib/admin';
import { getLegalPageInfo, validateLegalUpdate } from '@/lib/legal';
import { toLegalPage } from '@/lib/legalContent';
const { saveLegalPage } = require('@/lib/db');

export async function PUT(request, { params }) {
  try {
    const admin = await getAdminUser();
    if (!admin) return adminOnlyResponse();

    const { slug } = await params;
    const info = getLegalPageInfo(slug);
    if (!info) {
      return Response.json({ error: 'Page not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const fields = validateLegalUpdate(body);
    if (fields.error) {
      return Response.json({ error: fields.error }, { status: 400 });
    }

    const row = await saveLegalPage(info.slug, fields, admin.id);
    return Response.json({ page: toLegalPage(info, row) });
  } catch (error) {
    console.error('PUT /api/admin/legal/[slug] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
