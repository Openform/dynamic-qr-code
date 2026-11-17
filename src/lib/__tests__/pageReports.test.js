/**
 * Page reports: what a visitor's report may hold, how admins see reports
 * grouped by page, where a page's buttons and links go, and the alert email
 * (lib/pageReports.js, lib/pageReportAlert.js).
 */

import { describe, it, expect } from 'vitest';
import {
  REPORT_HONEYPOT,
  REPORT_MESSAGE_MAX,
  REPORT_REASONS,
  groupReportsByPage,
  isLikelyBot,
  linksOnPage,
  validatePageReport,
} from '../pageReports';
import { buildPageReportAlert, getReportAlertSettings } from '../pageReportAlert';

describe('validatePageReport', () => {
  it('takes a known reason and an optional message', () => {
    expect(validatePageReport({ reason: 'scam' })).toEqual({ reason: 'scam', message: null });
    expect(validatePageReport({ reason: ' other ', message: '  It asks for my PIN.  ' })).toEqual({ reason: 'other', message: 'It asks for my PIN.' });
    for (const { id } of REPORT_REASONS) expect(validatePageReport({ reason: id }).reason).toBe(id);
  });

  it('refuses a missing or unknown reason', () => {
    expect(validatePageReport({})).toEqual({ error: 'reason' });
    expect(validatePageReport({ reason: 'spam' })).toEqual({ error: 'reason' });
    expect(validatePageReport({ reason: ['scam'] })).toEqual({ error: 'reason' });
    expect(validatePageReport(null)).toEqual({ error: 'reason' });
  });

  it('keeps line breaks, drops other control characters, and limits the length', () => {
    expect(validatePageReport({ reason: 'scam', message: 'Line one\r\nLine two\u0000\u0007\n\n\n\nEnd' }).message).toBe('Line one\nLine two\n\nEnd');
    expect(validatePageReport({ reason: 'scam', message: 'x'.repeat(REPORT_MESSAGE_MAX) }).message).toHaveLength(REPORT_MESSAGE_MAX);
    expect(validatePageReport({ reason: 'scam', message: 'x'.repeat(REPORT_MESSAGE_MAX + 1) })).toEqual({ error: 'message' });
    // Counted in characters, not bytes or UTF-16 units.
    expect(validatePageReport({ reason: 'scam', message: '🙂'.repeat(REPORT_MESSAGE_MAX) }).error).toBeUndefined();
  });

  it('treats a non-text message as none', () => {
    expect(validatePageReport({ reason: 'scam', message: { evil: true } }).message).toBe(null);
  });
});

describe('isLikelyBot', () => {
  it('spots the hidden field filled in', () => {
    expect(isLikelyBot({ [REPORT_HONEYPOT]: 'https://spam.example' })).toBe(true);
    expect(isLikelyBot({ [REPORT_HONEYPOT]: '   ' })).toBe(false);
    expect(isLikelyBot({ reason: 'scam' })).toBe(false);
  });
});

describe('groupReportsByPage', () => {
  const page = (name) => ({ name, title: name, published: true, takenDownAt: null, ownerName: 'O', ownerEmail: 'o@example.com' });
  const reports = [
    { id: 1, pageId: 7, reason: 'scam', createdAt: '2026-11-10T08:00:00Z', handledAt: '2026-11-10T09:00:00Z', page: page('Old') },
    { id: 2, pageId: 9, reason: 'other', createdAt: '2026-11-12T08:00:00Z', handledAt: null, page: page('Newer') },
    { id: 3, pageId: 7, reason: 'illegal', createdAt: '2026-11-15T08:00:00Z', handledAt: null, page: page('Old') },
  ];

  it('puts each page once, newest report first, with open and closed reports apart', () => {
    const groups = groupReportsByPage(reports);
    expect(groups.map((g) => g.id)).toEqual([7, 9]);
    expect(groups[0]).toMatchObject({ name: 'Old', latestAt: '2026-11-15T08:00:00Z' });
    expect(groups[0].open.map((r) => r.id)).toEqual([3]);
    expect(groups[0].closed.map((r) => r.id)).toEqual([1]);
    expect(groupReportsByPage([])).toEqual([]);
  });
});

describe('linksOnPage', () => {
  it('lists where each button, linked photo and text link goes', () => {
    const links = linksOnPage([
      {
        type: 'buttons',
        items: [
          { id: 'a', kind: 'link', label: 'Log in to your bank', fields: { url: 'https://evil.example/login' } },
          { id: 'b', kind: 'call', label: 'Call us', fields: { number: '021 555 0100' } },
          { id: 'c', kind: 'contact', label: 'Save us', fields: { name: 'Bean There', phone: '0215550100', email: '', website: '' } },
        ],
      },
      { type: 'image', image: 1, alt: 'Cake', caption: '', link: 'https://example.com/cakes' },
      { type: 'text', text: 'See [our menu](https://example.com/menu), not [this](javascript:alert(1)).' },
      { type: 'faq', items: [{ question: 'Q?', answer: 'Email [us](mailto:hi@example.com).' }] },
      { type: 'details', rows: [{ value: '[not a link](https://example.com)' }] },
    ]);
    expect(links).toEqual([
      { where: 'Button', label: 'Log in to your bank', href: 'https://evil.example/login' },
      { where: 'Button', label: 'Call us', href: 'tel:0215550100' },
      { where: 'Button', label: 'Save us', href: 'Contact card: Bean There, 0215550100' },
      { where: 'Photo', label: 'Cake', href: 'https://example.com/cakes' },
      { where: 'Text', label: 'our menu', href: 'https://example.com/menu' },
      { where: 'FAQ', label: 'us', href: 'mailto:hi@example.com' },
    ]);
    expect(linksOnPage(undefined)).toEqual([]);
  });
});

describe('page report alert', () => {
  const page = { id: 12, name: 'Black Friday', title: 'Black Friday weekend', ownerName: 'Bean There', ownerEmail: 'owner@example.com' };

  it('says what was reported, whose page it is and where to deal with it', () => {
    const { subject, text } = buildPageReportAlert({ reason: 'scam', message: 'It asks for my PIN.\nTwice.' }, page, { baseUrl: 'https://qrgo.example/' });
    expect(subject).toBe('Page reported: Black Friday weekend');
    expect(text).toContain('Reason:  Scam or phishing');
    expect(text).toContain('  It asks for my PIN.\n  Twice.');
    expect(text).toContain('Owner:   Bean There <owner@example.com>');
    expect(text).toContain('https://qrgo.example/admin/pages/12');
    expect(text).toContain('https://qrgo.example/admin/reports');
  });

  it('keeps the subject on one line, whatever the page is called', () => {
    const { subject, text } = buildPageReportAlert({ reason: 'other', message: null }, { ...page, title: 'Evil\r\nBcc: x@example.com' });
    expect(subject).toBe('Page reported: Evil Bcc: x@example.com');
    expect(text).toContain('(none)');
    expect(text).not.toContain('/admin/');
  });

  it('goes to PAGE_REPORT_EMAILS, or else the invite alert recipients', () => {
    expect(getReportAlertSettings({})).toBe(null);
    expect(getReportAlertSettings({ RESEND_API_KEY: 'k', INVITE_ALERT_EMAILS: 'a@example.com' }).to).toEqual(['a@example.com']);
    expect(getReportAlertSettings({ RESEND_API_KEY: 'k', INVITE_ALERT_EMAILS: 'a@example.com', PAGE_REPORT_EMAILS: 'b@example.com, c@example.com' }).to).toEqual([
      'b@example.com',
      'c@example.com',
    ]);
  });
});
