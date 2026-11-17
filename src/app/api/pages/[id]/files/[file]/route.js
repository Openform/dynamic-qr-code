/**
 * GET /api/pages/[id]/files/[file] — the file a calendar or contact button
 * downloads, for the page's signed-in owner (the editor's preview and the
 * owner's preview page), from the saved page, whether or not the button is
 * showing. `[file]` is "<button id>.ics" or "<button id>.vcf".
 *
 * Visitors download from /r/[shortId]/p/[pageId]/f/[file] instead, which
 * checks the code and page like the page itself.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { buttonFile } from '@/lib/campaignPages';
import { getPageById } from '@/lib/db';
import { fileResponse, parseFileParam } from '@/lib/pageFiles';
import { idParam } from '@/lib/qrcodeApi';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return new Response('Authentication required', { status: 401 });
    const { id: rawId, file: rawFile } = await params;
    const id = idParam(rawId);
    const wanted = parseFileParam(rawFile);
    if (!id || !wanted) return notFound();

    const page = await getPageById(id, session.userId);
    const blocks = Array.isArray(page?.content?.blocks) ? page.content.blocks : [];
    const button = blocks.flatMap((block) => (block.type === 'buttons' && Array.isArray(block.items) ? block.items : [])).find((b) => b.id === wanted.buttonId);
    const file = buttonFile(button);
    if (!file || file.type !== wanted.type) return notFound();

    return fileResponse(file, { uid: `page-${id}-${wanted.buttonId}@qrgo` });
  } catch (error) {
    console.error('GET /api/pages/[id]/files/[file] error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
