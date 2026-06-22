/**
 * Proxy – protects /dashboard and /api/qrcodes routes.
 *
 * Public routes (/, /login, /register, /r/:shortId, /api/auth/*) are allowed
 * through without a valid token.
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecret } from './lib/auth.js';

const COOKIE_NAME = 'qr-auth-token';

export async function proxy(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return denyAccess(request);
  }

  try {
    await jwtVerify(token, getJwtSecret());
    return NextResponse.next();
  } catch {
    return denyAccess(request);
  }
}

/**
 * Redirect browser requests to /login; return 401 JSON for API requests.
 */
function denyAccess(request) {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

  if (isApiRoute) {
    return Response.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/qrcodes/:path*'],
};
