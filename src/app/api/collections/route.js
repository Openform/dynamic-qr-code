/**
 * GET  /api/collections  — List the authenticated user's collections (with code counts)
 * POST /api/collections  — Create a new collection
 *
 * The "Default Collection" is implicit: codes with no collection_id belong to
 * it. It is not stored as a row and is surfaced by the client, so it can never
 * be renamed or deleted. Names are unique per user (case-insensitive via the
 * collation) and a few reserved words are blocked to avoid clashing with it.
 */

import { getSession } from '@/lib/auth';
import { validateCollectionName } from '@/lib/collections';

const { getCollectionsByUserId, createCollection } = require('@/lib/db');

// ── GET — list collections ─────────────────────
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const collections = await getCollectionsByUserId(session.userId);
    return Response.json({ collections });
  } catch (error) {
    console.error('GET /api/collections error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST — create collection ───────────────────
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { error, name } = validateCollectionName(body?.name);
    if (error) {
      return Response.json({ error }, { status: 400 });
    }

    try {
      const collection = await createCollection(session.userId, name);
      return Response.json({ collection }, { status: 201 });
    } catch (err) {
      // Unique (user_id, name) violation — the user already has this collection.
      if (err && err.code === 'ER_DUP_ENTRY') {
        return Response.json(
          { error: 'You already have a collection with that name.' },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('POST /api/collections error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
