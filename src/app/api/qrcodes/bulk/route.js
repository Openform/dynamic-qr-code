/**
 * POST /api/qrcodes/bulk — Create many QR codes at once.
 *
 * Body: { rows: [{ title, destinationUrl }], styleConfig?, collectionId? }
 *
 * Every code gets the same style and goes into the same collection. The request
 * is all or nothing: if any row is invalid, or the batch would take the account
 * past its package limit, nothing is created.
 *
 * Responses:
 *   201 { created, qrcodes }                       — the new codes, in row order
 *   400 { error, errors?: [{ row, field, message }] } — bad input (row = 0-based index)
 *   403 { error, code: 'PACKAGE_LIMIT_REACHED', limit, remaining, requested }
 *   413 / 429 — body too large / too many batches in a short time
 */

import { getSession } from '@/lib/auth';
import { nanoid } from 'nanoid';
import {
  DEFAULT_STYLE,
  sanitizeStyleConfig,
  legacyFieldsFromStyle,
  evaluateContrast,
} from '@/lib/qrStyle';
import { CONTRAST_ERROR_MESSAGE } from '@/lib/codeInput';
import { getPackage } from '@/lib/packages';
import { rateLimit, isRateLimited } from '@/lib/rateLimit';
import { readJsonBody } from '@/lib/requestBody';
import { MAX_BULK_ROWS, MAX_BULK_BODY_BYTES, validateBulkRows } from '@/lib/bulk';

const { createQRCodesWithinLimit, getCollectionById } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Bulk creation is the heaviest write the app offers, so batches are throttled
// per account. Only batches that get as far as the database count (see below),
// so fixing a typo and resubmitting doesn't burn through the allowance.
const BATCH_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

function badRequest(error, extra = {}) {
  return Response.json({ error, ...extra }, { status: 400 });
}

function tooManyBatches(retryAfterSeconds) {
  return Response.json(
    { error: 'You’re creating codes too quickly. Please wait a little and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rateKey = `bulk-create:user:${session.userId}`;
    const peek = isRateLimited(rateKey, BATCH_LIMIT);
    if (!peek.ok) return tooManyBatches(peek.retryAfterSeconds);

    const parsed = await readJsonBody(request, MAX_BULK_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('Request body must be a JSON object.');
    }
    const { rows, styleConfig, collectionId } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return badRequest('Add at least one row.');
    }
    if (rows.length > MAX_BULK_ROWS) {
      return badRequest(`You can create at most ${MAX_BULK_ROWS} codes at a time.`);
    }

    // Collection: missing/empty/null means the Default Collection; anything
    // else must be one of this user's own collections.
    let resolvedCollectionId = null;
    if (collectionId != null && collectionId !== '') {
      const id = Number(collectionId);
      const collection = Number.isInteger(id) && id > 0
        ? await getCollectionById(id, session.userId)
        : null;
      if (!collection) return badRequest('Collection not found');
      resolvedCollectionId = collection.id;
    }

    // The style is shared by every code, so it is sanitized and contrast-checked
    // once. A missing style means the default look.
    if (styleConfig != null && (typeof styleConfig !== 'object' || Array.isArray(styleConfig))) {
      return badRequest('styleConfig must be an object.');
    }
    const sanitizedStyle = sanitizeStyleConfig(styleConfig ?? DEFAULT_STYLE);
    if (!evaluateContrast(sanitizedStyle).scannable) {
      return badRequest(CONTRAST_ERROR_MESSAGE);
    }
    const legacy = legacyFieldsFromStyle(sanitizedStyle);

    const { items, errors } = validateBulkRows(rows);
    if (errors.length > 0) {
      return badRequest('Some rows need fixing before the codes can be created.', { errors });
    }

    // This batch will reach the database, so it counts toward the throttle.
    const counted = rateLimit(rateKey, BATCH_LIMIT);
    if (!counted.ok) return tooManyBatches(counted.retryAfterSeconds);

    // The package limit is checked inside the insert transaction so it can't be
    // raced past by sending several requests at once.
    const created = await createQRCodesWithinLimit(
      {
        userId: session.userId,
        collectionId: resolvedCollectionId,
        ...legacy,
        styleConfig: sanitizedStyle,
        codes: items.map((item) => ({ shortId: nanoid(10), ...item })),
      },
      (packageId) => getPackage(packageId).limit
    );

    if (!created.ok) {
      if (created.reason === 'no_user') {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      const requested = items.length;
      const error =
        created.remaining === 0
          ? `You've reached your package limit of ${created.limit} QR codes. Delete a code or contact us to upgrade your package.`
          : `This batch has ${requested} codes, but your package (limit ${created.limit}) has room for ${created.remaining} more. Remove ${requested - created.remaining} from the list or contact us to upgrade your package.`;
      return Response.json(
        {
          error,
          code: 'PACKAGE_LIMIT_REACHED',
          limit: created.limit,
          remaining: created.remaining,
          requested,
        },
        { status: 403 }
      );
    }

    const qrcodes = created.qrcodes.map((qr) => ({
      ...qr,
      redirectUrl: `${BASE_URL}/r/${qr.shortId}`,
    }));
    return Response.json({ created: qrcodes.length, qrcodes }, { status: 201 });
  } catch (error) {
    console.error('POST /api/qrcodes/bulk error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
