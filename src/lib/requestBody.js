/**
 * Read a request's JSON body for API routes that accept a large payload.
 *
 * `request.json()` on its own turns a malformed body into a 500, and Next.js
 * silently truncates a body larger than its proxy buffer limit (which then
 * fails to parse). Reading the text first lets us reject both with a clear
 * 4xx instead.
 */

/**
 * Returns `{ ok: true, body }` with the parsed JSON, or
 * `{ ok: false, response }` with a ready-to-return error Response (413 when the
 * body is over `maxBytes`, 400 when it isn't valid JSON).
 */
export async function readJsonBody(request, maxBytes) {
  const tooLarge = () => ({
    ok: false,
    response: Response.json({ error: 'Request is too large.' }, { status: 413 }),
  });

  // Cheap early rejection when the client declares its size up front.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();

  // The header can be missing or wrong, so check what was actually received.
  const text = await request.text();
  if (text.length > maxBytes) return tooLarge();

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }),
    };
  }
}
