/**
 * Invite requests sent from the "Request an invite" form on the public pages:
 * the reply time we promise, field limits, and checks for a submitted form.
 *
 * Shared by the server and the browser, so this file must stay free of
 * server-only imports. Saving is in db.js, the team's email alert in
 * inviteAlert.js.
 */

import { isValidPackage } from './packages';

/** How soon we promise to reply. Shown on the form and in the alert email. */
export const REPLY_PROMISE = 'within 24 hours';

/** Requests still open after this long are flagged as overdue in the admin. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Matches the invite_requests table columns. */
export const INVITE_FIELD_LIMITS = { name: 255, email: 255, company: 255, phone: 40 };

/**
 * A hidden field that people never see or fill in. Simple spam bots fill in
 * every field, so a request with this set is quietly dropped.
 */
export const HONEYPOT_FIELD = 'leave_blank';

// something@something.tld, without spaces or characters that have a meaning in
// an email header (the address is used as Reply-To on the alert email).
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
const PHONE_RE = /^\+?[\d\s().-]+$/;

/**
 * Trim, turn any run of whitespace (line breaks included) into one space, and
 * drop other control characters, so a value is always a single clean line.
 */
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

/** True when the hidden spam-trap field was filled in. */
export function isLikelyBot(body) {
  const value = body?.[HONEYPOT_FIELD];
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Check a submitted form: { name, email, company?, phone?, package? }.
 * Returns the cleaned fields ready to save (empty optional fields as null) or
 * { error } with a message to show the visitor.
 */
export function validateInviteRequest(body) {
  const name = cleanText(body?.name);
  const email = cleanText(body?.email);
  const company = cleanText(body?.company);
  const phone = cleanText(body?.phone);
  const packageId = typeof body?.package === 'string' ? body.package.trim() : '';

  if (!name) {
    return { error: 'Please enter your name.' };
  }
  if (name.length > INVITE_FIELD_LIMITS.name) {
    return { error: `Your name is too long (the limit is ${INVITE_FIELD_LIMITS.name} characters).` };
  }
  if (!email) {
    return { error: 'Please enter your email address.' };
  }
  if (email.length > INVITE_FIELD_LIMITS.email || !EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  if (company.length > INVITE_FIELD_LIMITS.company) {
    return {
      error: `The company name is too long (the limit is ${INVITE_FIELD_LIMITS.company} characters).`,
    };
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (
      phone.length > INVITE_FIELD_LIMITS.phone ||
      !PHONE_RE.test(phone) ||
      digits < 7 ||
      digits > 15
    ) {
      return { error: 'Please enter a valid phone number, or leave it blank.' };
    }
  }
  if (packageId && !isValidPackage(packageId)) {
    return { error: 'Please choose a plan from the list.' };
  }

  return {
    name,
    email,
    company: company || null,
    phone: phone || null,
    package: packageId || null,
  };
}

/** "2026-10-29 09:15:00" (stored in UTC) → "2026-10-29T09:15:00Z", or null. */
function utcToIso(value) {
  if (!value) return null;
  return `${String(value).replace(' ', 'T')}Z`;
}

/** Shape an invite_requests row (see getInviteRequests in db.js) for the admin page. */
export function toClientInviteRequest(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company ?? null,
    phone: row.phone ?? null,
    package: row.package ?? null,
    createdAt: utcToIso(row.created_at),
    handledAt: utcToIso(row.handled_at),
    handledByName: row.handled_by_name ?? null,
    hasAccount: Boolean(Number(row.has_account)),
  };
}
