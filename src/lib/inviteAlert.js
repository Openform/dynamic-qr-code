/**
 * Emails the team about each new invite request, over SMTP.
 *
 * Settings (environment variables):
 *   SMTP_HOST            e.g. smtp.hostinger.com            (required)
 *   SMTP_PORT            465 (SSL, default) or 587 (STARTTLS)
 *   SMTP_USER            the mailbox to send from          (required)
 *   SMTP_PASSWORD        that mailbox's password           (required)
 *   SMTP_FROM            optional sender, default "QR Go <SMTP_USER>"
 *   INVITE_ALERT_EMAILS  optional, comma-separated; default ADMIN_EMAILS
 *
 * Without them, requests are still saved and listed at /admin/invites; only
 * the email is skipped, with a warning in the server log.
 */

import nodemailer from 'nodemailer';
import { getPackage, describeLimit } from './packages';
import { REPLY_PROMISE } from './inviteRequests';

function splitEmails(value) {
  return (value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

/** The SMTP settings and recipients, or null when alerts aren't set up. */
export function getAlertSettings(env = process.env) {
  const host = (env.SMTP_HOST || '').trim();
  const user = (env.SMTP_USER || '').trim();
  const pass = env.SMTP_PASSWORD || '';
  const to = splitEmails(env.INVITE_ALERT_EMAILS || env.ADMIN_EMAILS);
  if (!host || !user || !pass || to.length === 0) return null;

  const port = Number(env.SMTP_PORT) || 465;
  const from = (env.SMTP_FROM || '').trim() || { name: 'QR Go', address: user };
  // Port 465 speaks TLS from the start; 587 upgrades with STARTTLS.
  return { host, port, secure: port === 465, user, pass, from, to };
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

// One transport per settings, reused across requests.
let cached = { key: '', transport: null };

function getTransport(settings) {
  const key = JSON.stringify([settings.host, settings.port, settings.user, settings.pass]);
  if (cached.key !== key) {
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: { user: settings.user, pass: settings.pass },
        // Give up quickly rather than holding a connection open for minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return cached.transport;
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
        'Invite request saved, but no alert email was sent: set SMTP_HOST, SMTP_USER and SMTP_PASSWORD to turn alerts on (see README).'
      );
      warnedNotSetUp = true;
    }
    return false;
  }

  try {
    const { subject, text } = buildInviteAlert(request, { baseUrl: process.env.BASE_URL });
    await getTransport(settings).sendMail({
      from: settings.from,
      to: settings.to,
      // Replying to the alert goes straight to the person who asked.
      replyTo: { name: request.name, address: request.email },
      subject,
      text,
    });
    return true;
  } catch (error) {
    console.error('Could not send the invite request alert email:', error);
    return false;
  }
}
