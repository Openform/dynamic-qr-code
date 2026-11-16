/**
 * GET    /api/pages/[id] — One of the signed-in user's pages, with its content,
 *                          its `images` (with the owner's address for each),
 *                          `usedBy` (what sends scans to it, see getPageUsage
 *                          in db.js) and whether the account can edit it.
 * PUT    /api/pages/[id] — Save the whole page:
 *                          `{ name, content, endsAt?, afterEnd?, keptButton? }`.
 *                          Images the saved page doesn't use are deleted.
 * PATCH  /api/pages/[id] — Put the page online or take it offline: `{ published }`.
 * DELETE /api/pages/[id] — Delete the page with its images and reports.
 *
 * Saving needs a package with campaign pages. Switching a page off and
 * deleting it work on every package, so an account that has moved down a
 * package can still take its pages down (they keep showing until it does,
 * as schedules do).
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { idParam } from '@/lib/qrcodeApi';
import { parsePageInput, imageIdsInContent } from '@/lib/campaignPages';
import { ownerImagePath } from '@/lib/pageReference';
import {
  PRIVATE_HEADERS,
  toClientPage,
  loadUser,
  accountCanUsePages,
  packageErrorResponse,
  invalidPageResponse,
  readJson,
} from '@/lib/campaignPagesApi';
import {
  getPageById,
  getPageUsage,
  updatePage,
  setPagePublished,
  deletePage,
  getPageImageIds,
  getPageImages,
  deleteUnusedPageImages,
} from '@/lib/db';

const unauthorized = () => Response.json({ error: 'Authentication required' }, { status: 401 });

/** A page's images for the editor, with the owner's address for each. */
async function ownerImages(pageId) {
  return (await getPageImages(pageId)).map((image) => ({
    id: image.id,
    width: image.width,
    height: image.height,
    src: ownerImagePath(pageId, image),
  }));
}
const notFound = () => Response.json({ error: 'Page not found' }, { status: 404, headers: PRIVATE_HEADERS });

// ── GET — one page ─────────────────────────────
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const id = idParam((await params).id);
    if (!id) return notFound();

    const [page, user] = await Promise.all([getPageById(id, session.userId), loadUser(session.userId)]);
    if (!page) return notFound();
    return Response.json(
      {
        page: toClientPage(page),
        images: await ownerImages(id),
        usedBy: await getPageUsage(id, session.userId),
        canEdit: accountCanUsePages(user),
      },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    console.error('GET /api/pages/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PUT — save the page ────────────────────────
export async function PUT(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const id = idParam((await params).id);
    if (!id) return notFound();

    const user = await loadUser(session.userId);
    if (!user) return unauthorized();
    const existing = await getPageById(id, session.userId);
    if (!existing) return notFound();
    if (!accountCanUsePages(user)) return packageErrorResponse();

    const body = await readJson(request);
    const checked = parsePageInput(body, { imageIds: await getPageImageIds(id) });
    if (!checked.ok) return invalidPageResponse(checked);

    const page = await updatePage(id, session.userId, checked.page);
    if (!page) return notFound();
    // Photos uploaded and then replaced or dropped aren't kept.
    await deleteUnusedPageImages(id, imageIdsInContent(page.content));
    return Response.json({ page: toClientPage(page), images: await ownerImages(id) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error('PUT /api/pages/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH — online or offline ──────────────────
export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const id = idParam((await params).id);
    if (!id) return notFound();

    const body = await readJson(request);
    if (!body || typeof body.published !== 'boolean') {
      return Response.json({ error: 'Send `published` as true or false.' }, { status: 400 });
    }

    const page = await setPagePublished(id, session.userId, body.published);
    if (!page) return notFound();
    return Response.json({ page: toClientPage(page) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error('PATCH /api/pages/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE — delete the page ───────────────────
export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const id = idParam((await params).id);
    if (!id) return notFound();

    const deleted = await deletePage(id, session.userId);
    if (!deleted) return notFound();
    return Response.json({ message: 'Page deleted' }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error('DELETE /api/pages/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
