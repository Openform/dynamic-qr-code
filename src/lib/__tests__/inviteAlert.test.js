import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const send = vi.fn();
const Resend = vi.fn(function Resend(apiKey) {
  this.apiKey = apiKey;
  this.emails = { send };
});
vi.mock('resend', () => ({ Resend }));

const { getAlertSettings, buildInviteAlert, sendInviteAlert } = await import('../inviteAlert.js');

const RESEND = { RESEND_API_KEY: 're_test_123' };

const request = {
  name: 'Jane Smith',
  email: 'jane@acme.co.za',
  company: 'Acme Ltd',
  phone: null,
  package: 'business',
};

describe('getAlertSettings', () => {
  it('is null until the Resend API key is set', () => {
    expect(getAlertSettings({})).toBeNull();
    expect(getAlertSettings({ RESEND_API_KEY: ' ' })).toBeNull();
  });

  it('sends from mail@qrgo.openform.co.za to kenton@openform.co.za by default', () => {
    expect(getAlertSettings({ ...RESEND, ADMIN_EMAILS: 'admin@qrgo.test' })).toEqual({
      apiKey: 're_test_123',
      from: 'QR Go <mail@qrgo.openform.co.za>',
      to: ['kenton@openform.co.za'],
    });
  });

  it('uses the optional sender and recipients', () => {
    const settings = getAlertSettings({
      ...RESEND,
      INVITE_ALERT_FROM: 'QR Go <invites@qrgo.test>',
      INVITE_ALERT_EMAILS: 'sales@qrgo.test, owner@qrgo.test',
    });
    expect(settings.from).toBe('QR Go <invites@qrgo.test>');
    expect(settings.to).toEqual(['sales@qrgo.test', 'owner@qrgo.test']);
  });
});

describe('buildInviteAlert', () => {
  it('lists the details and links to the admin page', () => {
    const { subject, text } = buildInviteAlert(request, { baseUrl: 'https://qrgo.test/' });
    expect(subject).toBe('Invite request from Jane Smith');
    expect(text).toContain('Email:    jane@acme.co.za');
    expect(text).toContain('Company:  Acme Ltd');
    expect(text).toContain('Phone:    -');
    expect(text).toContain('Plan:     Business (20 codes)');
    expect(text).toContain('within 24 hours');
    expect(text).toContain('https://qrgo.test/admin/invites');
  });

  it('says "Not sure yet" without a plan, and leaves out the link without a base URL', () => {
    const { text } = buildInviteAlert({ ...request, package: null });
    expect(text).toContain('Plan:     Not sure yet');
    expect(text).not.toContain('/admin/invites');
  });
});

describe('sendInviteAlert', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    send.mockReset();
    Resend.mockClear();
    delete process.env.INVITE_ALERT_FROM;
    delete process.env.INVITE_ALERT_EMAILS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it('skips the email, without failing, when alerts are not set up', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendInviteAlert(request)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('emails kenton@openform.co.za with Reply-To set to the person who asked', async () => {
    Object.assign(process.env, RESEND, { BASE_URL: 'https://qrgo.test' });
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await expect(sendInviteAlert(request)).resolves.toBe(true);
    expect(Resend).toHaveBeenCalledWith('re_test_123');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'QR Go <mail@qrgo.openform.co.za>',
        to: ['kenton@openform.co.za'],
        replyTo: 'jane@acme.co.za',
        subject: 'Invite request from Jane Smith',
        text: expect.stringContaining('https://qrgo.test/admin/invites'),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('logs and returns false when Resend returns an error', async () => {
    Object.assign(process.env, RESEND);
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'The domain is not verified', statusCode: 403 },
    });

    await expect(sendInviteAlert(request)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('logs and returns false when the request to Resend throws', async () => {
    Object.assign(process.env, RESEND);
    send.mockRejectedValue(new Error('network down'));

    await expect(sendInviteAlert(request)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});
