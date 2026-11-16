/**
 * POST /api/pages/[id]/images — upload a photo for one of the signed-in
 * user's pages, as multipart form data with the file in `file`. The editor
 * resizes and re-saves photos in the browser first (lib/imageResize.js); the
 * server checks the bytes themselves (lib/pageImageFiles.js) whatever they
 * claim to be. Answers `{ image: { id, width, height, src } }`, where `src`
 * is the owner's address for it; the page shows it once a block uses it and
 * the page is saved.
 *
 * Needs a package with campaign pages. A page keeps at most
 * MAX_STORED_IMAGES; when it's full, images its saved content doesn't use
 * are cleared out first.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { idParam } from '@/lib/qrcodeApi';
import { rateLimit } from '@/lib/rateLimit';
import { imageIdsInContent } from '@/lib/campaignPages';
import { checkImageFile, MAX_IMAGE_BYTES, MAX_STORED_IMAGES } from '@/lib/pageImageFiles';
import { ownerImagePath } from '@/lib/pageReference';
import { PRIVATE_HEADERS, loadUser, accountCanUsePages, packageErrorResponse } from '@/lib/campaignPagesApi';
import { getPageById, addPageImage, deleteUnusedPageImages } from '@/lib/db';

// Generous for someone trying photos out, and a cap on what one account can push.
const UPLOAD_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

const fail = (error, status = 400) => Response.json({ error }, { status, headers: PRIVATE_HEADERS });

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const id = idParam((await params).id);
    const page = id ? await getPageById(id, session.userId) : null;
    if (!page) return fail('Page not found', 404);
    if (!accountCanUsePages(await loadUser(session.userId))) return packageErrorResponse();

    const limited = rateLimit(`page-image:user:${session.userId}`, UPLOAD_LIMIT);
    if (!limited.ok) {
      return Response.json(
        { error: 'That’s a lot of photos at once. Please wait a little and try again.' },
        { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return fail('Choose a photo to upload.');
    if (file.size > MAX_IMAGE_BYTES) return fail(checkImageFile(Buffer.alloc(MAX_IMAGE_BYTES + 1)).error);

    const data = Buffer.from(await file.arrayBuffer());
    const checked = checkImageFile(data);
    if (!checked.ok) return fail(checked.error);

    const image = { pageId: id, mimeType: checked.mimeType, width: checked.width, height: checked.height, hash: checked.hash, data };
    let added = await addPageImage(image, MAX_STORED_IMAGES);
    if (!added.ok && added.reason === 'limit') {
      await deleteUnusedPageImages(id, imageIdsInContent(page.content));
      added = await addPageImage(image, MAX_STORED_IMAGES);
    }
    if (!added.ok) {
      return added.reason === 'not_found'
        ? fail('Page not found', 404)
        : fail('This page has as many photos as it can keep. Remove one from a block and save, then try again.', 409);
    }

    const { id: imageId, width, height } = added.image;
    return Response.json(
      { image: { id: imageId, width, height, src: ownerImagePath(id, added.image) } },
      { status: 201, headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    console.error('POST /api/pages/[id]/images error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
