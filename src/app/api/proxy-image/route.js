import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing URL parameter', { status: 400 });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return new NextResponse('Invalid URL parameter', { status: 400 });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return new NextResponse('Invalid URL protocol', { status: 400 });
  }

  // Prevent SSRF to internal networks/localhost
  const hostname = parsedUrl.hostname.toLowerCase();

  // Use stricter matching to avoid false positives like 10.example.com
  const isInternalIp =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    // Strict IP regex matching
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^169\.254\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/.test(hostname) ||
    // Catch-all for nip.io/xip.io like domains mapping to 127.0.0.1
    /(^|\.)(127\.\d+\.\d+\.\d+|0\.0\.0\.0)\./.test(hostname);

  if (isInternalIp) {
    return new NextResponse('Internal network access forbidden', { status: 403 });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: 'manual', // Prevent SSRF via redirects to internal networks
    });

    // In manual redirect mode, 3xx statuses will be returned directly.
    // If we want to strictly follow redirects but validate them, we'd have to loop.
    // For a simple proxy, we can just block redirects entirely or return the redirect to the client.
    // Here we'll block redirects or treat them as errors to be safe against SSRF redirect bypasses.
    if (response.status >= 300 && response.status < 400) {
      return new NextResponse('Redirects are not allowed', { status: 400 });
    }

    if (!response.ok) {
      return new NextResponse('Failed to fetch image', { status: response.status });
    }

    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse('Error fetching image', { status: 500 });
  }
}
