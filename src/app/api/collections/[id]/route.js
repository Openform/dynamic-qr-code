/**
 * PUT    /api/collections/[id]  — Rename a collection
 * DELETE /api/collections/[id]  — Delete a collection (its codes revert to Default)
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { validateCollectionName } from '@/lib/collections';

const { updateCollection, deleteCollection } = require('@/lib/db');

// ── PUT — rename collection ─────────────────────
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
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
      const collection = await updateCollection(Number(id), session.userId, name);
      if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
      }
      return Response.json({ collection });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return Response.json(
          { error: 'You already have a collection with that name.' },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('PUT /api/collections/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE — delete collection ──────────────────
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const deleted = await deleteCollection(Number(id), session.userId);
    if (!deleted) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    return Response.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    console.error('DELETE /api/collections/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
