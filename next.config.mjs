// Sent on every response. These are intentionally conservative so they can't
// break the app: no `default-src`/`script-src` CSP (which would need a nonce for
// Next's inline hydration scripts) — only directives that are safe site-wide.
// Clickjacking is covered by X-Frame-Options + CSP `frame-ancestors`.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mysql2'],
  allowedDevOrigins: ['192.168.0.44'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
