import { NextResponse } from 'next/server';
import http from 'http';
import https from 'https';
import dns from 'dns';
import ipaddr from 'ipaddr.js';

// Check if an IP address string is an internal/private IP
const isInternalIpAddress = (ip) => {
  try {
    const parsedIp = ipaddr.parse(ip);
    const range = parsedIp.range();
    return range !== 'unicast'; // Block internal, link-local, loopback, multicast, etc.
  } catch (e) {
    // If we can't parse it, block it to be safe
    return true;
  }
};

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

  // Block common local domains and explicitly internal hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return new NextResponse('Internal network access forbidden', { status: 403 });
  }

  // If the hostname itself is an IP, check it immediately to fast-fail
  try {
    if (ipaddr.isValid(hostname)) {
      if (isInternalIpAddress(hostname)) {
        return new NextResponse('Internal network access forbidden', { status: 403 });
      }
    } else {
      // Catch-all for nip.io/xip.io like domains
      // nip.io format: <ip>.nip.io, or <name>.<ip>.nip.io
      // Since DNS lookup will catch them anyway, the fast-fail is just optimization.
      // But we can check if hostname ends with .nip.io or .xip.io and extract the IP if needed.
      // Actually, since we do actual DNS lookup, we don't strictly need the regex catch-all anymore,
      // the `isInternalIpAddress` inside `dns.lookup` handles the real resolution.
    }
  } catch (e) {
    // ignore
  }

  try {
    const { status, contentType, buffer } = await new Promise((resolve, reject) => {
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const req = client.get(
        parsedUrl,
        {
          lookup: (lookupHostname, options, callback) => {
            // Force autoSelectFamily to false or explicitly handle arrays
            const lookupOptions = { ...options, all: false };
            dns.lookup(lookupHostname, lookupOptions, (err, address, family) => {
              if (err) return callback(err);
              // In case 'all: true' somehow sneaks through or is explicitly requested, handle arrays
              if (Array.isArray(address)) {
                for (const addrObj of address) {
                  if (isInternalIpAddress(addrObj.address)) {
                    return callback(new Error('Internal network access forbidden during DNS resolution'));
                  }
                }
              } else if (isInternalIpAddress(address)) {
                return callback(new Error('Internal network access forbidden during DNS resolution'));
              }
              callback(null, address, family);
            });
          },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400) {
            res.destroy();
            return reject(new Error('REDIRECT'));
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.destroy();
            return reject(new Error(`FETCH_FAILED:${res.statusCode}`));
          }

          const resContentType = res.headers['content-type'];
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              contentType: resContentType,
              buffer: Buffer.concat(chunks),
            });
          });
        }
      );

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('TIMEOUT'));
      });

      req.on('error', reject);
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    if (error.message === 'REDIRECT') {
      return new NextResponse('Redirects are not allowed', { status: 400 });
    }
    if (error.message.startsWith('FETCH_FAILED:')) {
      const status = parseInt(error.message.split(':')[1], 10);
      return new NextResponse('Failed to fetch image', { status });
    }
    if (error.message === 'Internal network access forbidden during DNS resolution') {
      return new NextResponse('Internal network access forbidden', { status: 403 });
    }
    console.error('Image proxy error:', error);
    return new NextResponse('Error fetching image', { status: 500 });
  }
}
