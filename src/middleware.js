/**
 * Middleware – protects /dashboard and /api/qrcodes routes.
 *
 * Public routes (/, /login, /register, /r/:shortId, /api/auth/*) are allowed
 * through without a valid token.
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);
const COOKIE_NAME = 'qr-auth-token';

export async function middleware(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return denyAccess(request);
  }

  try {
    await jwtVerify(token, JWT_SECRET);
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
