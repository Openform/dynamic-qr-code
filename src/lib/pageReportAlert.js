/**
 * Emails the team when a campaign page is reported, through Resend, with the
 * same key and sender as invite alerts (lib/inviteAlert.js).
 *
 * Settings (environment variables):
 *   RESEND_API_KEY      the Resend API key (required, as for invite alerts)
 *   PAGE_REPORT_EMAILS  optional, comma-separated recipients; by default the
 *                       invite alert recipients (INVITE_ALERT_EMAILS)
 *
 * Only a page's first open report is emailed: more reports about it before
 * an admin deals with it are just added to /admin/reports, so a flood of
 * reports can't flood the inbox. Without the key, reports are still saved.
 */

import { deliver, getAlertSettings } from './inviteAlert';
import { REASON_NAMES } from './pageReports';

/** The Resend key, sender and recipients for report alerts, or null when alerts aren't set up. */
export function getReportAlertSettings(env = process.env) {
  const settings = getAlertSettings(env);
  if (!settings) return null;
  const to = (env.PAGE_REPORT_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  return to.length > 0 ? { ...settings, to } : settings;
}

/** Text on one line, for a subject or a field. */
function oneLine(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
}

/**
 * Subject and plain-text body of the alert. `report` is `{ reason, message }`;
 * `page` is `{ id, name, title, ownerName, ownerEmail }`.
 */
export function buildPageReportAlert(report, page, { baseUrl } = {}) {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  const title = oneLine(page.title) || oneLine(page.name);
  const message = report.message ? report.message.split('\n').map((line) => `  ${line}`) : ['  (none)'];
  const lines = [
    'A visitor reported a campaign page.',
    '',
    `Reason:  ${REASON_NAMES[report.reason] ?? report.reason}`,
    'Message:',
    ...message,
    '',
    `Page:    ${title} (named “${oneLine(page.name)}” by its owner, page ${page.id})`,
    `Owner:   ${oneLine(page.ownerName)} <${oneLine(page.ownerEmail)}>`,
  ];
  if (base) {
    lines.push('', `See the page as visitors do: ${base}/admin/pages/${page.id}`, `Take it down or close the report: ${base}/admin/reports`);
  }
  lines.push('', 'More reports about this page are added to the reports screen without another email until it’s dealt with.');
  return { subject: `Page reported: ${title}`.slice(0, 200), text: lines.join('\n') };
}

/** Email the team about a page's first open report. Never throws; returns true when sent. */
export async function sendPageReportAlert(report, page) {
  const settings = getReportAlertSettings();
  if (!settings) {
    console.warn('Page report saved, but no alert email was sent: RESEND_API_KEY isn’t set on the server.');
    return false;
  }
  try {
    const { subject, text } = buildPageReportAlert(report, page, { baseUrl: process.env.BASE_URL });
    const result = await deliver(settings, { subject, text });
    if (!result.ok) {
      console.error('Could not send the page report alert email:', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Could not send the page report alert email:', error);
    return false;
  }
}
