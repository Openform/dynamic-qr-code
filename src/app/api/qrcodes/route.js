/**
 * GET  /api/qrcodes       — List all QR codes for the authenticated user
 * POST /api/qrcodes       — Create a new QR code
 */

import { getSession } from '@/lib/auth';
import { nanoid } from 'nanoid';
import {
  sanitizeStyleConfig,
  legacyFieldsFromStyle,
  normalizeDestinationUrl,
  isValidDestinationUrl,
  evaluateContrast,
} from '@/lib/qrStyle';
import { getPackage } from '@/lib/packages';
// toClientQRCode is for the POST response, whose record comes from
// getQRCodeById (snake_case columns). Do NOT use it for the GET list:
// getQRCodesByUserId already returns camelCase fields, so re-mapping them reads
// undefined for every field (the cause of URLs/styling vanishing on refresh).
import { toClientQRCode, redirectUrlFor } from '@/lib/clientQRCode';

const { getQRCodesByUserId, createQRCodeWithinLimit, getCollectionById } = require('@/lib/db');

// ── GET — list QR codes ────────────────────────
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // getQRCodesByUserId already returns the client shape (camelCase fields with
    // styleConfig parsed, and scheduled changes); only the public redirect URL
    // needs attaching.
    const qrcodes = await getQRCodesByUserId(session.userId);
    const clientQRCodes = qrcodes.map((qr) => ({
      ...qr,
      redirectUrl: redirectUrlFor(qr.shortId),
    }));

    return Response.json({ qrcodes: clientQRCodes });
  } catch (error) {
    console.error('GET /api/qrcodes error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── POST — create QR code ──────────────────────
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      title,
      destinationUrl,
      foregroundColor,
      backgroundColor,
      fgColor,
      bgColor,
      logoUrl,
      dotStyle,
      cornerSquareStyle,
      cornerDotStyle,
      styleConfig,
      collectionId,
    } = body;

    // Validation
    if (!title || !destinationUrl) {
      return Response.json(
        { error: 'Title and destination URL are required' },
        { status: 400 }
      );
    }

    // Resolve the target collection. A missing/empty/null value means the
    // Default Collection; any other value must be one of the user's own
    // collections, so a crafted request can't drop a code into someone else's.
    let resolvedCollectionId = null;
    if (collectionId != null && collectionId !== '') {
      const collection = await getCollectionById(Number(collectionId), session.userId);
      if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 400 });
      }
      resolvedCollectionId = collection.id;
    }

    // Autofill https:// when the scheme is omitted, then require https — plain
    // http URLs are rejected.
    const normalizedUrl = normalizeDestinationUrl(destinationUrl);
    if (!isValidDestinationUrl(normalizedUrl)) {
      return Response.json(
        { error: 'Invalid destination URL. Must be a valid https URL.' },
        { status: 400 }
      );
    }

    const shortId = nanoid(10);

    // Prefer the full style config; sanitize untrusted input and derive the
    // legacy flat columns from it. Fall back to the legacy body fields for
    // older clients that don't send a styleConfig.
    const sanitizedStyle = sanitizeStyleConfig(styleConfig);

    // Reject codes whose foreground/background contrast is too low to scan, so a
    // crafted request can't bypass the client-side contrast check. Only a
    // confident failure blocks — borderline/transparent cases are allowed.
    if (sanitizedStyle && !evaluateContrast(sanitizedStyle).scannable) {
      return Response.json(
        { error: 'Foreground and background contrast is too low to scan reliably. Use a darker foreground or a lighter background.' },
        { status: 400 }
      );
    }

    const legacy = sanitizedStyle
      ? legacyFieldsFromStyle(sanitizedStyle)
      : {
          foregroundColor: foregroundColor || fgColor || '#000000',
          backgroundColor: backgroundColor || bgColor || '#ffffff',
          logoUrl: logoUrl || null,
          dotStyle,
          cornerSquareStyle,
          cornerDotStyle,
        };

    // The package limit is checked inside the insert transaction so it can't
    // be raced past by sending several requests at once.
    const created = await createQRCodeWithinLimit(
      {
        shortId,
        userId: session.userId,
        collectionId: resolvedCollectionId,
        title,
        destinationUrl: normalizedUrl,
        ...legacy,
        styleConfig: sanitizedStyle,
      },
      (packageId) => getPackage(packageId).limit
    );

    if (!created.ok) {
      if (created.reason === 'no_user') {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      return Response.json(
        {
          error: `You've reached your package limit of ${created.limit} QR codes. Delete a code or contact us to upgrade your package.`,
          code: 'PACKAGE_LIMIT_REACHED',
        },
        { status: 403 }
      );
    }

    return Response.json({ qrcode: toClientQRCode(created.qrcode) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/qrcodes error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
