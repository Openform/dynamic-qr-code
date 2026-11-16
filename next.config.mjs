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

// Campaign pages (/r/[shortId]/p/[pageId]) show what customers write, so they
// get a tighter policy on top of the site-wide one: images, fonts and
// requests only from QR Go itself, and no frames, plugins or media from
// anywhere. Still no script-src (see above). Next uses the last matching
// header with the same key, so this repeats the site-wide directives too.
const campaignPageHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "manifest-src 'self'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mysql2', 'maxmind'],
  allowedDevOrigins: ['192.168.0.44'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/r/:shortId/p/:path*', headers: campaignPageHeaders },
    ];
  },
};

export default nextConfig;
