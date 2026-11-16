/**
 * GET /api/pages/[id]/images/[image] — one of a page's images for its
 * signed-in owner (the editor and the preview), whether or not the page
 * shows it yet. `[image]` is "<id>-<hash>"; the hash changes with the
 * image, so the browser can keep it for good.
 *
 * Visitors load images from /r/[shortId]/p/[pageId]/i/[image] instead, which
 * checks the code and page like the page itself.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { idParam } from '@/lib/qrcodeApi';
import { imageHeaders, parseImageParam } from '@/lib/pageImageFiles';
import { getPageById, getPageImageData } from '@/lib/db';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return new Response('Authentication required', { status: 401 });
    const { id: rawId, image: rawImage } = await params;
    const id = idParam(rawId);
    const image = parseImageParam(rawImage);
    if (!id || !image || !(await getPageById(id, session.userId))) return notFound();

    const stored = await getPageImageData(image.id, id);
    if (!stored || stored.hash !== image.hash) return notFound();
    return new Response(stored.data, { headers: imageHeaders(stored.mimeType, stored.data.length) });
  } catch (error) {
    console.error('GET /api/pages/[id]/images/[image] error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
