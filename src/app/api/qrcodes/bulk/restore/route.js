/**
 * POST /api/qrcodes/bulk/restore — Restore codes from Trash.
 *
 * Body: { ids: [number, ...] }
 *
 * A restored code works again with the same short link and its scan history.
 * Trashed codes don't count toward the package limit, so restoring is checked
 * against it like creating is: all or nothing, so if the codes wouldn't fit
 * nothing is restored. Ids that aren't in the user's Trash are ignored.
 *
 * Responses:
 *   200 { restored, qrcodes }                                  — the restored codes
 *   403 { error, code: 'PACKAGE_LIMIT_REACHED', limit, remaining, requested }
 *   400 bad ids · 401 · 413
 */

import { getSession } from '@/lib/auth';
import { readJsonBody } from '@/lib/requestBody';
import { validateIdList } from '@/lib/trash';
import { getPackage } from '@/lib/packages';

const { restoreQRCodes } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
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

    const result = await restoreQRCodes(
      session.userId,
      checked.ids,
      (packageId) => getPackage(packageId).limit
    );

    if (!result.ok) {
      if (result.reason === 'no_user') {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      const { limit, remaining, requested } = result;
      const error =
        remaining === 0
          ? `You've reached your package limit of ${limit} QR codes, so nothing can be restored. Delete a code or contact us to upgrade your package.`
          : `Your package (limit ${limit}) has room for ${remaining} more ${remaining === 1 ? 'code' : 'codes'}, but ${requested} were selected. Select fewer, or contact us to upgrade your package.`;
      return Response.json(
        { error, code: 'PACKAGE_LIMIT_REACHED', limit, remaining, requested },
        { status: 403 }
      );
    }

    const qrcodes = result.qrcodes.map((qr) => ({
      ...qr,
      redirectUrl: `${BASE_URL}/r/${qr.shortId}`,
    }));
    return Response.json({ restored: result.restored, qrcodes });
  } catch (error) {
    console.error('POST /api/qrcodes/bulk/restore error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
