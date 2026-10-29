/**
 * Emails the team about each new invite request, through Resend
 * (https://resend.com).
 *
 * Settings (environment variables):
 *   RESEND_API_KEY       the Resend API key                 (required)
 *   INVITE_ALERT_FROM    optional sender, default "QR Go <mail@qrgo.openform.co.za>".
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

export const DEFAULT_ALERT_FROM = 'QR Go <mail@qrgo.openform.co.za>';
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

const NOT_SET_UP =
  "RESEND_API_KEY isn't set on the server. Add it to the app's environment variables, then restart or redeploy the app.";

/** What the admin page shows about alerts. Never includes the API key. */
export function getAlertStatus(env = process.env) {
  const settings = getAlertSettings(env);
  if (!settings) return { configured: false };
  return { configured: true, from: settings.from, to: settings.to };
}

/** Resend's own message, or a plain explanation when Resend couldn't be reached. */
export function describeSendError(error) {
  // The SDK answers like this when the request got no response at all.
  if (error?.name === 'application_error' && error.statusCode == null) {
    return "The server couldn't reach Resend (api.resend.com). Check that the host allows outgoing HTTPS requests.";
  }
  const message = error?.message || String(error);
  return error?.name ? `${message} (${error.name})` : message;
}

/**
 * Send one email through Resend. Never throws. Returns { ok: true, id }, or
 * { ok: false, error } with a message an admin can act on.
 */
async function deliver(settings, { subject, text, replyTo }) {
  try {
    const { data, error } = await getClient(settings.apiKey).emails.send(
      { from: settings.from, to: settings.to, replyTo, subject, text },
      { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }
    );
    // Resend reports problems (bad key, unverified domain...) as a returned error.
    if (error) return { ok: false, error: describeSendError(error) };
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    return { ok: false, error: describeSendError(error) };
  }
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
      console.warn(`Invite request saved, but no alert email was sent: ${NOT_SET_UP}`);
      warnedNotSetUp = true;
    }
    return false;
  }

  try {
    const { subject, text } = buildInviteAlert(request, { baseUrl: process.env.BASE_URL });
    // Replying to the alert goes straight to the person who asked.
    const result = await deliver(settings, { subject, text, replyTo: request.email });
    if (!result.ok) {
      console.error('Could not send the invite request alert email:', result.error);
      return false;
    }
    console.log(`Invite request alert emailed to ${settings.to.join(', ')} (Resend id ${result.id}).`);
    return true;
  } catch (error) {
    console.error('Could not send the invite request alert email:', error);
    return false;
  }
}

/**
 * Send a test alert straight away, for the "Send test email" button on the
 * admin page. Returns { ok: true, id, to } or { ok: false, error }.
 */
export async function sendTestAlert(admin = {}) {
  const settings = getAlertSettings();
  if (!settings) return { ok: false, error: NOT_SET_UP };

  const text = [
    `This is a test email from QR Go, sent by ${admin.name || admin.email || 'an admin'} from the Invite requests page.`,
    '',
    `New invite requests will be emailed to ${settings.to.join(', ')} from ${settings.from}.`,
  ].join('\n');
  const result = await deliver(settings, {
    subject: 'QR Go test email: invite alerts are working',
    text,
    replyTo: admin.email || undefined,
  });
  return result.ok ? { ...result, to: settings.to } : result;
}
