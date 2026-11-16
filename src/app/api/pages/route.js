/**
 * GET  /api/pages — The signed-in user's campaign pages (without content),
 *                   with whether they can add and edit pages and how many
 *                   their package allows.
 * POST /api/pages — Create a page.
 *
 * POST takes `{ name, content?, endsAt?, afterEnd?, keptButton? }` (see
 * parsePageInput() in lib/campaignPages.js). Without `content` the page
 * starts with just its header, titled with its name. A new page has no
 * images yet, so its blocks can't show any.
 *
 * Adding and editing pages needs a package with campaign pages
 * (lib/packages.js); the number of pages is checked inside the insert, so
 * several requests at once can't pass the limit.
 */

import { getSession } from '@/lib/auth';
import { pageLimitFor } from '@/lib/packages';
import { parsePageInput, newPageContent, checkPageName } from '@/lib/campaignPages';
import {
  PRIVATE_HEADERS,
  toClientPage,
  loadUser,
  accountCanUsePages,
  packageErrorResponse,
  invalidPageResponse,
  readJson,
} from '@/lib/campaignPagesApi';
import { getPagesByUserId, createPageWithinLimit } from '@/lib/db';

const unauthorized = () => Response.json({ error: 'Authentication required' }, { status: 401 });

// ── GET — list pages ───────────────────────────
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const [user, pages] = await Promise.all([loadUser(session.userId), getPagesByUserId(session.userId)]);
    if (!user) return unauthorized();

    return Response.json(
      {
        pages: pages.map(toClientPage),
        canEdit: accountCanUsePages(user),
        limit: pageLimitFor(user.package),
      },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    console.error('GET /api/pages error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST — create a page ───────────────────────
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const user = await loadUser(session.userId);
    if (!user) return unauthorized();
    if (!accountCanUsePages(user)) return packageErrorResponse();

    const body = await readJson(request);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    let input = body;
    if (body.content === undefined) {
      const name = checkPageName(body.name);
      if (name.error) return invalidPageResponse({ path: 'name', error: name.error });
      input = { ...body, content: newPageContent(name.value) };
    }

    const checked = parsePageInput(input, { imageIds: new Set() });
    if (!checked.ok) return invalidPageResponse(checked);

    const created = await createPageWithinLimit(
      { userId: session.userId, ...checked.page },
      (packageId) => pageLimitFor(packageId)
    );
    if (!created.ok) {
      if (created.reason === 'no_user') return unauthorized();
      return Response.json(
        {
          error: `You've reached your package limit of ${created.limit} campaign pages. Delete a page or contact us to upgrade your package.`,
          code: 'PACKAGE_LIMIT_REACHED',
        },
        { status: 403, headers: PRIVATE_HEADERS }
      );
    }

    return Response.json({ page: toClientPage(created.page) }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error('POST /api/pages error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
