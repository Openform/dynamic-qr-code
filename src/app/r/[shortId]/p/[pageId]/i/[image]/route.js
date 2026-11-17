/**
 * GET /r/[shortId]/p/[pageId]/i/[image] — an image on a campaign page, for
 * visitors. It's under the page's own path so it gets the same checks as the
 * page (lib/publicPage.js: the code, its owner, its password cookie, that it
 * links to the page, and that the page is on), and only images the page's
 * saved content shows are served: a photo uploaded in the editor but not
 * saved stays private. `[image]` is "<id>-<hash>"; the hash changes with the
 * image, so browsers keep it for good.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { imageIdsInContent } from '@/lib/campaignPages';
import { imageHeaders, parseImageParam } from '@/lib/pageImageFiles';
import { loadPublicPage } from '@/lib/publicPage';
import { UNLOCK_COOKIE } from '@/lib/unlock';
import { getPageImageData } from '@/lib/db';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request, { params }) {
  try {
    const { shortId, pageId, image: rawImage } = await params;
    const image = parseImageParam(rawImage);
    if (!image) return notFound();

    const { page } = await loadPublicPage({ shortId, pageId, unlockToken: request.cookies.get(UNLOCK_COOKIE)?.value });
    if (!page || !imageIdsInContent(page.content).has(image.id)) return notFound();

    const stored = await getPageImageData(image.id, page.id);
    if (!stored || stored.hash !== image.hash) return notFound();
    return new Response(stored.data, { headers: imageHeaders(stored.mimeType, stored.data.length) });
  } catch (error) {
    console.error('Campaign page image error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
