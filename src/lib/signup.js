/**
 * The main "get an account" button on the public pages.
 *
 * Sign-up is invite-only. When INVITE_REQUEST_URL is set (a mailto: link or an
 * https:// form), the button asks for an invite there. Otherwise it goes
 * straight to /register, which asks for the invite code.
 *
 * Read on the server, so the value is baked into the page at build time.
 */
export function getSignupCta(env = process.env) {
  const url = (env.INVITE_REQUEST_URL || '').trim();

  // Only links that can't run script: an email or a secure web page.
  if (/^(https:\/\/|mailto:)\S+$/i.test(url)) {
    return { href: url, label: 'Request an invite', external: true };
  }

  return { href: '/register', label: 'Create an account', external: false };
}
