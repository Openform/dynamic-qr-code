/**
 * GET  /api/qrcodes       — List all QR codes for the authenticated user
 * POST /api/qrcodes       — Create a new QR code
 */

import { getSession } from '@/lib/auth';
import { nanoid } from 'nanoid';
import {
  sanitizeStyleConfig,
  legacyFieldsFromStyle,
  evaluateContrast,
} from '@/lib/qrStyle';
import { getPackage } from '@/lib/packages';
import { checkTitle, isContentType, isStaticType, parseContent, DEFAULT_CONTENT_TYPE } from '@/lib/contentTypes';
import { sealContent } from '@/lib/codeContent';
// toClientQRCode is for the POST response, whose record comes from
// getQRCodeById (snake_case columns). Do NOT use it for the GET list:
// getQRCodesByUserId already returns camelCase fields, so re-mapping them reads
// undefined for every field (the cause of URLs/styling vanishing on refresh).
import { toClientQRCode, withClientContent, PRIVATE_HEADERS } from '@/lib/clientQRCode';
import { scheduleSummary } from '@/lib/schedules';

const {
  getQRCodesByUserId,
  createQRCodeWithinLimit,
  getCollectionById,
  getNotEndedSchedulesByUserId,
} = require('@/lib/db');

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
    // styleConfig parsed, and scheduled changes); each code's content, its
    // public redirect URL and its schedule summary are added here.
    const [qrcodes, schedules] = await Promise.all([
      getQRCodesByUserId(session.userId),
      getNotEndedSchedulesByUserId(session.userId),
    ]);
    const schedulesByCode = Map.groupBy(schedules, (s) => s.qrcodeId);
    const now = Date.now();
    const clientQRCodes = qrcodes.map((qr) => ({
      ...withClientContent(qr),
      ...scheduleSummary(schedulesByCode.get(qr.id) ?? [], now),
    }));

    return Response.json({ qrcodes: clientQRCodes }, { headers: PRIVATE_HEADERS });
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
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

    // Validation. The title is an internal label; the content is checked by
    // its type's rules (lib/contentTypes.js), which also build the link a
    // scan goes to — a request can't supply a ready-made one. Older clients
    // send just `destinationUrl`, which means a website code.
    const checkedTitle = checkTitle(title);
    if (checkedTitle.error) {
      return Response.json({ error: checkedTitle.error, field: 'title' }, { status: 400 });
    }

    const contentType = body.contentType ?? DEFAULT_CONTENT_TYPE;
    if (!isContentType(contentType)) {
      return Response.json({ error: 'Choose what the code should do.' }, { status: 400 });
    }
    const contentInput =
      contentType === 'url' && body.content == null ? { url: destinationUrl } : body.content;
    const checkedContent = parseContent(contentType, contentInput);
    if (!checkedContent.ok) {
      return Response.json(
        { error: checkedContent.error, field: checkedContent.field },
        { status: 400 }
      );
    }
    const isStatic = isStaticType(contentType);

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

    const shortId = nanoid(10);

    // Prefer the full style config; sanitize untrusted input and derive the
    // legacy flat columns from it. Fall back to the legacy body fields for
    // older clients that don't send a styleConfig.
    const sanitizedStyle = sanitizeStyleConfig(styleConfig);
    // Phones only act on Wi-Fi details in a QR code, so static codes are
    // always QR (never Data Matrix).
    if (sanitizedStyle && isStatic) sanitizedStyle.codeType = 'qr';

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
        title: checkedTitle.value,
        destinationUrl: checkedContent.destination,
        contentType,
        // A static code's content includes a password, so it's only ever
        // stored encrypted (lib/codeContent.js).
        contentData: isStatic ? sealContent(checkedContent.content, shortId) : null,
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

    return Response.json(
      { qrcode: toClientQRCode(created.qrcode) },
      { status: 201, headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    console.error('POST /api/qrcodes error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
