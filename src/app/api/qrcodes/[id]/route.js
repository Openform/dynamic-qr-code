/**
 * GET    /api/qrcodes/[id]  — Get a single QR code
 * PUT    /api/qrcodes/[id]  — Update a QR code
 * DELETE /api/qrcodes/[id]  — Delete a QR code
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { normalizeDestinationUrl, isValidDestinationUrl } from '@/lib/qrStyle';
const { getQRCodeById, updateQRCode, deleteQRCode, getCollectionById } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/** Safely parse a stored style_config value (string or already-parsed object). */
function parseStyleConfig(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Transform a DB record (snake_case) to a client-friendly shape (camelCase).
 */
function toClientQRCode(qrcode) {
  return {
    id: qrcode.id,
    shortId: qrcode.short_id,
    userId: qrcode.user_id,
    collectionId: qrcode.collection_id,
    title: qrcode.title,
    destinationUrl: qrcode.destination_url,
    fgColor: qrcode.foreground_color,
    bgColor: qrcode.background_color,
    logoUrl: qrcode.logo_url,
    dotStyle: qrcode.dot_style,
    cornerSquareStyle: qrcode.corner_square_style,
    cornerDotStyle: qrcode.corner_dot_style,
    styleConfig: parseStyleConfig(qrcode.style_config),
    scanCount: qrcode.scan_count,
    createdAt: qrcode.created_at,
    updatedAt: qrcode.updated_at,
    redirectUrl: `${BASE_URL}/r/${qrcode.short_id}`,
  };
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

    const qrcode = await getQRCodeById(Number(id), session.userId);
    if (!qrcode) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ qrcode: toClientQRCode(qrcode) });
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

    const body = await request.json();
    const { title } = body;
    let { destinationUrl } = body;

    // A code's visual appearance is immutable after creation. Once it has been
    // printed or shared, changing colours, code type, shape, logo, error
    // correction, etc. would produce a different image that no longer matches
    // the codes already in the wild. Only the title (an internal label), the
    // destination URL, and the collection (an organizational label that doesn't
    // affect the image) may change — any style fields in the body are ignored,
    // so the lock holds even against a hand-crafted request.

    // Validate destination URL if provided: autofill https:// when the scheme
    // is omitted, then require https — plain http URLs are rejected.
    if (destinationUrl) {
      destinationUrl = normalizeDestinationUrl(destinationUrl);
      if (!isValidDestinationUrl(destinationUrl)) {
        return Response.json(
          { error: 'Invalid destination URL. Must be a valid https URL.' },
          { status: 400 }
        );
      }
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

    const updated = await updateQRCode(Number(id), session.userId, {
      title,
      destinationUrl,
      collectionId,
    });

    if (!updated) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ qrcode: toClientQRCode(updated) });
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
