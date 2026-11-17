/**
 * GET /api/admin/pages/[id]/images/[image] — one of any account's page
 * images, for admins looking at a reported page (/admin/pages/[id]).
 * `[image]` is "<id>-<hash>", as for the owner's own route
 * (/api/pages/[id]/images/[image]).
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getAdminUser } from '@/lib/admin';
import { getPageImageData } from '@/lib/db';
import { imageHeaders, parseImageParam } from '@/lib/pageImageFiles';
import { idParam } from '@/lib/qrcodeApi';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request, { params }) {
  try {
    if (!(await getAdminUser())) return new Response('Admin access required', { status: 403 });
    const { id: rawId, image: rawImage } = await params;
    const id = idParam(rawId);
    const image = parseImageParam(rawImage);
    if (!id || !image) return notFound();

    const stored = await getPageImageData(image.id, id);
    if (!stored || stored.hash !== image.hash) return notFound();
    return new Response(stored.data, { headers: imageHeaders(stored.mimeType, stored.data.length) });
  } catch (error) {
    console.error('GET /api/admin/pages/[id]/images/[image] error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
