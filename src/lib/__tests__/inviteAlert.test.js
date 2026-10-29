import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const { getAlertSettings, buildInviteAlert, sendInviteAlert } = await import('../inviteAlert.js');

const SMTP = {
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_USER: 'hello@qrgo.test',
  SMTP_PASSWORD: 'secret',
  ADMIN_EMAILS: 'admin@qrgo.test, owner@qrgo.test',
};

const request = {
  name: 'Jane Smith',
  email: 'jane@acme.co.za',
  company: 'Acme Ltd',
  phone: null,
  package: 'business',
};

describe('getAlertSettings', () => {
  it('is null until the mailbox and a recipient are set', () => {
    expect(getAlertSettings({})).toBeNull();
    expect(getAlertSettings({ ...SMTP, SMTP_PASSWORD: '' })).toBeNull();
    expect(getAlertSettings({ ...SMTP, SMTP_HOST: ' ' })).toBeNull();
    expect(getAlertSettings({ ...SMTP, ADMIN_EMAILS: '' })).toBeNull();
  });

  it('defaults to SSL on port 465, sending as QR Go to the admins', () => {
    expect(getAlertSettings(SMTP)).toEqual({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      user: 'hello@qrgo.test',
      pass: 'secret',
      from: { name: 'QR Go', address: 'hello@qrgo.test' },
      to: ['admin@qrgo.test', 'owner@qrgo.test'],
    });
  });

  it('uses STARTTLS on other ports, and the optional sender and recipients', () => {
    const settings = getAlertSettings({
      ...SMTP,
      SMTP_PORT: '587',
      SMTP_FROM: 'QR Go <invites@qrgo.test>',
      INVITE_ALERT_EMAILS: 'sales@qrgo.test',
    });
    expect(settings.port).toBe(587);
    expect(settings.secure).toBe(false);
    expect(settings.from).toBe('QR Go <invites@qrgo.test>');
    expect(settings.to).toEqual(['sales@qrgo.test']);
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
    sendMail.mockReset();
    createTransport.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it('skips the email, without failing, when alerts are not set up', async () => {
    for (const key of Object.keys(SMTP)) delete process.env[key];
    await expect(sendInviteAlert(request)).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('emails the team with Reply-To set to the person who asked', async () => {
    Object.assign(process.env, SMTP, { BASE_URL: 'https://qrgo.test' });
    sendMail.mockResolvedValue({});

    await expect(sendInviteAlert(request)).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@qrgo.test', 'owner@qrgo.test'],
        replyTo: { name: 'Jane Smith', address: 'jane@acme.co.za' },
        subject: 'Invite request from Jane Smith',
      })
    );
  });

  it('logs and returns false when the mail server fails', async () => {
    Object.assign(process.env, SMTP);
    sendMail.mockRejectedValue(new Error('connection refused'));

    await expect(sendInviteAlert(request)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});
