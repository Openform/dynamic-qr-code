/**
 * GET    /api/qrcodes/[id]  — Get a single QR code
 * PUT    /api/qrcodes/[id]  — Update a QR code. `accessPassword` sets or
 *                            changes the code's password (Business package
 *                            and up); null or "" removes it (any package);
 *                            leaving it out keeps it.
 * DELETE /api/qrcodes/[id]  — Delete a QR code
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { checkTitle, getContentType, parseContent } from '@/lib/contentTypes';
import { PRIVATE_HEADERS } from '@/lib/clientQRCode';
import { loadClientQRCode, idParam, accessPasswordFromBody } from '@/lib/qrcodeApi';
const { getQRCodeById, updateQRCode, deleteQRCode, getCollectionById } = require('@/lib/db');

function badRequest(error, field) {
  return Response.json({ error, ...(field ? { field } : {}) }, { status: 400 });
}

// ── GET — single QR code ───────────────────────
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const qrcode = await loadClientQRCode(Number(id), session.userId);
    if (!qrcode) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ qrcode }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error('GET /api/qrcodes/[id] error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── PUT — update QR code ───────────────────────
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const codeId = idParam(id);
    const existing = codeId ? await getQRCodeById(codeId, session.userId) : null;
    if (!existing) {
      return Response.json({ error: 'QR code not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return badRequest('Invalid request');

    // A code's visual appearance is immutable after creation. Once it has been
    // printed or shared, changing colours, code type, shape, logo, error
    // correction, etc. would produce a different image that no longer matches
    // the codes already in the wild. Only the title (an internal label), where
    // a scan goes, and the collection (an organizational label that doesn't
    // affect the image) may change — any style fields in the body are ignored,
    // so the lock holds even against a hand-crafted request. The password
    // doesn't change the image either, so it can change too.

    let title;
    if (body.title !== undefined) {
      const checked = checkTitle(body.title);
      if (checked.error) return badRequest(checked.error, 'title');
      title = checked.value;
    }

    // What the code does is fixed when it's created; only its details change.
    const type = getContentType(existing.content_type);
    if (body.contentType !== undefined && body.contentType !== type.id) {
      return badRequest("A code's type can't be changed after it's created. Create a new code instead.");
    }

    // The new destination, built from the type's fields (lib/contentTypes.js).
    // Website codes also take `destinationUrl`, as they always have. Static
    // codes (Wi-Fi) hold their content in the printed image, so it's locked.
    let destinationUrl;
    const hasContent = body.content !== undefined && body.content !== null;
    const hasUrl = body.destinationUrl !== undefined && body.destinationUrl !== null && body.destinationUrl !== '';
    if (type.kind === 'static') {
      if (hasContent || hasUrl) {
        return badRequest(
          'Wi-Fi details are part of the printed code, so they can’t be changed. Create a new code instead.'
        );
      }
    } else if (hasContent || hasUrl) {
      if (hasUrl && type.id !== 'url') {
        return badRequest('This code isn’t a website code, so it can’t be given a link.');
      }
      const checked = parseContent(type.id, hasContent ? body.content : { url: body.destinationUrl });
      if (!checked.ok) return badRequest(checked.error, checked.field);
      destinationUrl = checked.destination;
    }

    // Collection assignment is tri-state: omit the key to leave it unchanged,
    // send null/'' to move the code to the Default Collection, or send a
    // collection id (which must belong to this user) to move it there.
    let collectionId; // undefined → unchanged
    if ('collectionId' in body) {
      const raw = body.collectionId;
      if (raw == null || raw === '') {
        collectionId = null;
      } else {
        const collection = await getCollectionById(Number(raw), session.userId);
        if (!collection) {
          return Response.json({ error: 'Collection not found' }, { status: 400 });
        }
        collectionId = collection.id;
      }
    }

    // The password: compared with the current one, so saving it unchanged
    // works on any package. Static codes (Wi-Fi) never reach QR Go when
    // they're scanned, so they can't have one.
    let accessPassword; // undefined → unchanged
    if ('accessPassword' in body) {
      const password = await accessPasswordFromBody(body, session.userId, existing.access_password);
      if (password.response) return password.response;
      if (type.kind === 'static' && password.value) {
        return badRequest('Wi-Fi codes can’t have a password: scanning them never reaches QR Go.', 'accessPassword');
      }
      accessPassword = password.value;
    }

    const updated = await updateQRCode(codeId, session.userId, {
      title,
      destinationUrl,
      collectionId,
      accessPassword,
    });

    if (!updated) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json(
      { qrcode: await loadClientQRCode(updated.id, session.userId) },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    console.error('PUT /api/qrcodes/[id] error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── DELETE — delete QR code ────────────────────
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const deleted = await deleteQRCode(Number(id), session.userId);
    if (!deleted) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    console.error('DELETE /api/qrcodes/[id] error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
