/**
 * The redirect a scan gets when its QR code can't send the visitor anywhere
 * (see /r/[shortId]): the visitor lands on /code-unavailable, which explains
 * why (inactive, expired, not-found or error).
 *
 * The Location is deliberately *relative*. `request.url` is built from the
 * address the Node server itself is bound to (e.g. http://localhost:3000), not
 * from the Host header, so an absolute URL made from it points at the server's
 * own localhost whenever the app sits behind a proxy or is opened from another
 * device (a phone scanning the code). The visitor's browser then can't connect
 * and shows Chrome's own error page instead of ours. A relative Location is
 * resolved by the browser against the URL it actually requested, so it lands
 * on the same public host the code was scanned on. Don't switch this back to
 * `new URL(..., request.url)`, or to BASE_URL (which defaults to localhost).
 *
 * (NextResponse.redirect only accepts absolute URLs, so this builds the
 * response by hand.)
 */
export function unavailableRedirect(reason) {
  return new Response(null, {
    status: 302,
    headers: { Location: `/code-unavailable?reason=${reason}` },
  });
}
