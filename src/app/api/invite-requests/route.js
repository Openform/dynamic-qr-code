/**
 * POST /api/invite-requests
 *
 * Public: the "Request access" form on the landing page.
 * Body: { name, email, company?, phone?, package? }
 *
 * The request is saved for the admin page (/admin/invites), then the team is
 * emailed. The email goes out after the response, so the visitor never waits
 * on the mail server, and a failed email never loses the request.
 */

import { after } from 'next/server';
import { rateLimit, isRateLimited, getClientIp } from '@/lib/rateLimit';
import { validateInviteRequest, isLikelyBot } from '@/lib/inviteRequests';
import { sendInviteAlert } from '@/lib/inviteAlert';
const { createInviteRequest } = require('@/lib/db');

// Saved requests per IP. Plenty for a person, not for a flood of alert emails.
// Only saved requests count, so fixing a typo in the form doesn't use one up.
const IP_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

export async function POST(request) {
  try {
    const ipKey = `invite-request:ip:${getClientIp(request)}`;
    const ipState = isRateLimited(ipKey, IP_LIMIT);
    if (!ipState.ok) {
      return Response.json(
        { error: "You've sent a few requests already. Please try again a little later." },
        { status: 429, headers: { 'Retry-After': String(ipState.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Looks like the visitor succeeded, so the bot learns nothing.
    if (isLikelyBot(body)) {
      return Response.json({ ok: true }, { status: 201 });
    }

    const fields = validateInviteRequest(body);
    if (fields.error) {
      return Response.json({ error: fields.error }, { status: 400 });
    }

    await createInviteRequest(fields);
    rateLimit(ipKey, IP_LIMIT);
    after(() => sendInviteAlert(fields));

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Invite request error:', error);
    return Response.json(
      { error: "We couldn't send your request just now. Please try again in a few minutes." },
      { status: 500 }
    );
  }
}
