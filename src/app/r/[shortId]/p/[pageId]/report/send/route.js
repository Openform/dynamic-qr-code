/**
 * POST /r/[shortId]/p/[pageId]/report/send — what the "Report this page"
 * form (../page.js) posts. A plain form post, so it works without
 * JavaScript, and always answered with a redirect (303) back to the form:
 * "?sent=1" once the report is saved, "?error=<what>" when it isn't.
 *
 * It's under the page's path so it checks the code and page like the page
 * does (lib/publicPage.js): only a page you can see can be reported. Each IP
 * address can send 5 reports an hour (only saved ones count), and posts from
 * other sites are refused. The report itself never says who sent it.
 *
 * A page's first open report is emailed to the team after the response
 * (lib/pageReportAlert.js); later ones just appear at /admin/reports.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { after } from 'next/server';
import { createPageReport, getUserById } from '@/lib/db';
import { REPORT_HONEYPOT, isLikelyBot, validatePageReport } from '@/lib/pageReports';
import { sendPageReportAlert } from '@/lib/pageReportAlert';
import { pageReportPath } from '@/lib/pageReference';
import { loadPublicPage } from '@/lib/publicPage';
import { getClientIp, isRateLimited, rateLimit } from '@/lib/rateLimit';
import { redirectToSitePath } from '@/lib/siteRedirect';
import { UNLOCK_COOKIE } from '@/lib/unlock';

const IP_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

// Far more than a 1,000-character message needs; anything bigger is refused unread.
const MAX_BODY_BYTES = 16 * 1024;

const SHORT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const PAGE_ID = /^[1-9][0-9]{0,9}$/;

export async function POST(request, { params }) {
  const { shortId, pageId } = await params;
  if (!SHORT_ID.test(shortId) || !PAGE_ID.test(pageId)) return new Response('Not found', { status: 404 });
  const back = (query) => redirectToSitePath(`${pageReportPath(shortId, pageId)}${query}`, 303);

  try {
    // A form on another site can't send reports in a visitor's name.
    if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403 });

    const found = await loadPublicPage({ shortId, pageId, unlockToken: request.cookies.get(UNLOCK_COOKIE)?.value });
    if (found.locked) return redirectToSitePath(`/r/${encodeURIComponent(shortId)}`, 303);
    if (!found.page) return redirectToSitePath(`/code-unavailable?reason=${found.reason}`, 303);

    const ipKey = `page-report:ip:${getClientIp(request)}`;
    if (!isRateLimited(ipKey, IP_LIMIT).ok) return back('?error=busy');

    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return back('?error=message');
    const form = await request.formData().catch(() => null);
    const fields = Object.fromEntries(['reason', 'message', REPORT_HONEYPOT].map((key) => [key, form?.get(key)]));

    // Looks like it worked, so the bot learns nothing.
    if (isLikelyBot(fields)) return back('?sent=1');

    const report = validatePageReport(fields);
    if (report.error) return back(`?error=${report.error}`);

    const { page, qrcode } = found;
    const { openCount } = await createPageReport({ pageId: page.id, ...report });
    rateLimit(ipKey, IP_LIMIT);

    if (openCount === 1) {
      after(async () => {
        const owner = await getUserById(qrcode.user_id);
        await sendPageReportAlert(report, {
          id: page.id,
          name: page.name,
          title: page.content?.blocks?.[0]?.title,
          ownerName: owner?.name,
          ownerEmail: owner?.email,
        });
      });
    }
    return back('?sent=1');
  } catch (error) {
    console.error('Page report error:', error);
    return back('?error=failed');
  }
}
