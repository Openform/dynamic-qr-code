/**
 * GET /r/[shortId]/p/[pageId]/f/[file] — the file a calendar or contact
 * button on a campaign page downloads: "<button id>.ics" (an event) or
 * "<button id>.vcf" (a contact card). It's under the page's own path so it
 * gets the same checks as the page (lib/publicPage.js), and it's built from
 * the saved page, only for a button visitors can see right now.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { buttonFile, shownButton } from '@/lib/campaignPages';
import { fileResponse, parseFileParam } from '@/lib/pageFiles';
import { loadPublicPage } from '@/lib/publicPage';
import { UNLOCK_COOKIE } from '@/lib/unlock';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request, { params }) {
  try {
    const { shortId, pageId, file: rawFile } = await params;
    const wanted = parseFileParam(rawFile);
    if (!wanted) return notFound();

    const { page } = await loadPublicPage({ shortId, pageId, unlockToken: request.cookies.get(UNLOCK_COOKIE)?.value });
    if (!page) return notFound();
    const file = buttonFile(shownButton(page, wanted.buttonId));
    if (!file || file.type !== wanted.type) return notFound();

    return fileResponse(file, { uid: `page-${page.id}-${wanted.buttonId}@qrgo` });
  } catch (error) {
    console.error('Campaign page file error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
