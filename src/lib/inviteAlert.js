/**
 * Emails the team about each new invite request, through Resend
 * (https://resend.com).
 *
 * Settings (environment variables):
 *   RESEND_API_KEY       the Resend API key                 (required)
 *   INVITE_ALERT_FROM    optional sender, default "QR Go <mail@qr.openform.co.za>".
 *                        Its domain must be verified in Resend.
 *   INVITE_ALERT_EMAILS  optional, comma-separated recipients; default
 *                        kenton@openform.co.za
 *
 * Without the API key, requests are still saved and listed at /admin/invites;
 * only the email is skipped, with a warning in the server log.
 */

import { Resend } from 'resend';
import { getPackage, describeLimit } from './packages';
import { REPLY_PROMISE } from './inviteRequests';

export const DEFAULT_ALERT_FROM = 'QR Go <mail@qr.openform.co.za>';
export const DEFAULT_ALERT_TO = ['kenton@openform.co.za'];

// Give up on Resend after this long rather than hold the request open.
const SEND_TIMEOUT_MS = 15_000;

function splitEmails(value) {
  return (value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

/** The Resend key, sender and recipients, or null when alerts aren't set up. */
export function getAlertSettings(env = process.env) {
  const apiKey = (env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const from = (env.INVITE_ALERT_FROM || '').trim() || DEFAULT_ALERT_FROM;
  const to = splitEmails(env.INVITE_ALERT_EMAILS);
  return { apiKey, from, to: to.length > 0 ? to : DEFAULT_ALERT_TO };
}

/** "Business (20 codes)", or "Not sure yet" when no plan was picked. */
function describePlan(packageId) {
  if (!packageId) return 'Not sure yet';
  return `${getPackage(packageId).name} (${describeLimit(packageId).toLowerCase()})`;
}

/** Subject and plain-text body of the alert for one request. */
export function buildInviteAlert(request, { baseUrl } = {}) {
  const lines = [
    `${request.name} asked for an invite to QR Go.`,
    '',
    `Name:     ${request.name}`,
    `Email:    ${request.email}`,
    `Company:  ${request.company || '-'}`,
    `Phone:    ${request.phone || '-'}`,
    `Plan:     ${describePlan(request.package)}`,
    '',
    `We told them they'd hear back ${REPLY_PROMISE}. Reply to this email to answer them directly.`,
  ];

  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  if (base) {
    lines.push('', `All requests (mark this one done when you've replied): ${base}/admin/invites`);
  }

  return { subject: `Invite request from ${request.name}`, text: lines.join('\n') };
}

// One client per API key, reused across requests.
let cached = { apiKey: '', client: null };

function getClient(apiKey) {
  if (cached.apiKey !== apiKey) {
    cached = { apiKey, client: new Resend(apiKey) };
  }
  return cached.client;
}

let warnedNotSetUp = false;

/**
 * Email the team about a saved request. Never throws: a failure is logged and
 * the request stays saved for the admin page. Returns true when sent.
 */
export async function sendInviteAlert(request) {
  const settings = getAlertSettings();
  if (!settings) {
    if (!warnedNotSetUp) {
      console.warn(
        'Invite request saved, but no alert email was sent: set RESEND_API_KEY to turn alerts on (see README).'
      );
      warnedNotSetUp = true;
    }
    return false;
  }

  try {
    const { subject, text } = buildInviteAlert(request, { baseUrl: process.env.BASE_URL });
    const { error } = await getClient(settings.apiKey).emails.send(
      {
        from: settings.from,
        to: settings.to,
        // Replying to the alert goes straight to the person who asked.
        replyTo: request.email,
        subject,
        text,
      },
      { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }
    );
    // Resend reports problems (bad key, unverified domain...) as a returned error.
    if (error) {
      console.error('Could not send the invite request alert email:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Could not send the invite request alert email:', error);
    return false;
  }
}
