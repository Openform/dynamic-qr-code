// Bulk creation API: the all-or-nothing batch, package limits, validation, style and
// collection handling, the per-request cap and the hourly throttle.
import { api as call, check, config, escapeRegExp, finish, register, sql, stamp } from '../lib/harness.mjs';

const rows = (n, tag = 'c') => Array.from({ length: n }, (_, i) => ({ title: `${tag} ${i + 1}`, destinationUrl: `example.com/${tag}/${i + 1}` }));

console.log('Unauthenticated');
{
  const r = await call(null, 'POST', '/api/qrcodes/bulk', { rows: rows(1) });
  check('bulk create without a session is 401', r.status === 401, r.status);
  const u = await call(null, 'POST', '/api/qrcodes/bulk/trash', { ids: [1] });
  check('trash without a session is 401', u.status === 401, u.status);
}

const cookie = await register(`bulk-a-${stamp}@example.com`);
const userId = Number(sql(`SELECT id FROM users WHERE email='bulk-a-${stamp}@example.com'`));
console.log(`User ${userId} (Starter, limit 5)`);

console.log('Happy path');
let batch1;
{
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(3, 'a') });
  check('201 with 3 rows (static /bulk route wins over /[id])', r.status === 201, r);
  batch1 = r.json?.qrcodes ?? [];
  check('created count is 3', r.json?.created === 3);
  check('codes come back in row order', batch1.map((q) => q.title).join('|') === 'a 1|a 2|a 3', batch1.map((q) => q.title));
  check('URL normalised to https', batch1[0]?.destinationUrl === 'https://example.com/a/1', batch1[0]?.destinationUrl);
  check('redirectUrl attached', new RegExp(`^${escapeRegExp(config.redirectBase)}/r/[\\w-]{10}$`).test(batch1[0]?.redirectUrl ?? ''), batch1[0]?.redirectUrl);
  check('camelCase client shape with parsed styleConfig', batch1[0]?.styleConfig?.codeType === 'qr' && batch1[0]?.shortId && 'collectionId' in batch1[0], batch1[0]);
  check('short ids are unique', new Set(batch1.map((q) => q.shortId)).size === 3);
  const hist = sql(`SELECT COUNT(*) FROM qrcode_destinations d JOIN qrcodes q ON q.id=d.qrcode_id WHERE q.user_id=${userId}`);
  check('one destination-history row per code', hist === '3', hist);
  const list = await call(cookie, 'GET', '/api/qrcodes');
  check('GET list newest-first, stable within a batch', list.json?.qrcodes?.map((q) => q.title).join('|') === 'a 3|a 2|a 1', list.json?.qrcodes?.map((q) => q.title));
}

console.log('Package limit is all-or-nothing');
{
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(3, 'b') });
  check('403 when the batch exceeds the room left', r.status === 403 && r.json?.code === 'PACKAGE_LIMIT_REACHED', r);
  check('reports limit/remaining/requested', r.json?.limit === 5 && r.json?.remaining === 2 && r.json?.requested === 3, r.json);
  check('message says how many to remove', /room for 2 more/.test(r.json?.error ?? '') && /Remove 1/.test(r.json?.error ?? ''), r.json?.error);
  const count = sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND deleted_at IS NULL`);
  check('nothing was created (still 3 codes)', count === '3', count);
  const ok = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(2, 'c') });
  check('a batch that exactly fills the limit succeeds', ok.status === 201, ok);
  const full = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(1, 'd') });
  check('at the limit: 403 with the "reached" message', full.status === 403 && full.json?.remaining === 0 && /reached your package limit of 5/.test(full.json?.error ?? ''), full.json);
  // move that exact-fill batch to Trash to leave room for later tests
  const ids = ok.json.qrcodes.map((q) => q.id);
  await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids });
}

console.log('Over-limit account (limit lowered after codes existed)');
{
  sql(`UPDATE users SET package='starter' WHERE id=${userId}`);
  // Force more codes than the limit by inserting directly
  sql(`INSERT INTO qrcodes (short_id,user_id,title,destination_url) VALUES ('overlimit01',${userId},'x','https://x.com'),('overlimit02',${userId},'y','https://y.com'),('overlimit03',${userId},'z','https://z.com')`);
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(1, 'e') });
  check('remaining is clamped to 0, not negative', r.status === 403 && r.json?.remaining === 0, r.json);
  sql(`DELETE FROM qrcodes WHERE short_id LIKE 'overlimit%'`);
}

console.log('Validation (nothing is created on any error)');
{
  const before = sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND deleted_at IS NULL`);
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk', {
    rows: [
      { title: 'fine', destinationUrl: 'fine.com' },
      { title: '', destinationUrl: 'http://insecure.com' },
      { title: 'x'.repeat(256), destinationUrl: 'ok.com' },
      { title: 'no url', destinationUrl: '' },
      null,
    ],
  });
  check('400 with per-row errors', r.status === 400 && Array.isArray(r.json?.errors), r);
  const keys = (r.json?.errors ?? []).map((e) => `${e.row}:${e.field}`);
  check('error indexes/fields are right', keys.join(',') === '1:title,1:destinationUrl,2:title,3:destinationUrl,4:title,4:destinationUrl', keys);
  const after = sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND deleted_at IS NULL`);
  check('the valid row was NOT created either', before === after, { before, after });

  check('empty rows -> 400', (await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: [] })).status === 400);
  check('missing rows -> 400', (await call(cookie, 'POST', '/api/qrcodes/bulk', {})).status === 400);
  check('rows not an array -> 400', (await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: 'nope' })).status === 400);
  check('201 rows -> 400 (cap is 200)', (await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(201) })).status === 400);
  const bad = await call(cookie, 'POST', '/api/qrcodes/bulk', undefined, '{not json');
  check('malformed JSON -> 400, not 500', bad.status === 400, bad);
  const arr = await call(cookie, 'POST', '/api/qrcodes/bulk', [1, 2]);
  check('array body -> 400', arr.status === 400, arr);
  const big = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: [{ title: 'a'.repeat(2 * 1024 * 1024), destinationUrl: 'a.com' }] });
  check('2 MB body -> 413', big.status === 413, big.status);
  const lowContrast = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(1), styleConfig: { fgColor: '#eeeeee', bgColor: '#ffffff' } });
  check('low-contrast style -> 400', lowContrast.status === 400 && /contrast/i.test(lowContrast.json?.error ?? ''), lowContrast.json);
  const badStyle = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(1), styleConfig: 'oops' });
  check('non-object styleConfig -> 400', badStyle.status === 400, badStyle.json);
}

console.log('Style and collection are applied to every code');
let styled;
{
  const other = await register(`bulk-b-${stamp}@example.com`);
  const otherId = Number(sql(`SELECT id FROM users WHERE email='bulk-b-${stamp}@example.com'`));
  const col = await call(other, 'POST', '/api/collections', { name: 'Theirs' });
  const mine = await call(cookie, 'POST', '/api/collections', { name: `Mine ${stamp}` });
  const foreign = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(1), collectionId: col.json?.collection?.id });
  check("someone else's collection -> 400", foreign.status === 400 && foreign.json?.error === 'Collection not found', foreign.json);
  const junk = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(1), collectionId: 'abc' });
  check('non-numeric collection -> 400 (not 500)', junk.status === 400, junk);
  const style = { codeType: 'qr', dotStyle: 'dots', fgColor: '#112233', bgColor: '#ffffee', errorCorrectionLevel: 'Q', logoUrl: 'http://not-https.example/logo.png' };
  styled = await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(2, 's'), collectionId: mine.json.collection.id, styleConfig: style });
  check('201 with style + own collection', styled.status === 201, styled);
  const q = styled.json?.qrcodes ?? [];
  check('every code is in the collection', q.every((c) => c.collectionId === mine.json.collection.id));
  check('style stored on every code (sanitised)', q.every((c) => c.styleConfig?.dotStyle === 'dots' && c.styleConfig?.fgColor === '#112233' && c.styleConfig?.errorCorrectionLevel === 'Q'));
  check('http logo URL was dropped by sanitising', q.every((c) => c.styleConfig?.logoUrl === ''), q[0]?.styleConfig?.logoUrl);
  check('legacy flat columns kept in sync', q[0]?.fgColor === '#112233' && q[0]?.bgColor === '#ffffee' && q[0]?.dotStyle === 'dots', q[0]);
  void otherId;
}

console.log('The old hard-delete undo endpoint is gone');
{
  sql(`UPDATE users SET package='business' WHERE id=${userId}`); // headroom for the sections below
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk/undo', { ids: [1] });
  check('/api/qrcodes/bulk/undo no longer exists (404)', r.status === 404, r.status);
}

console.log('Single create (refactored to shared validation)');
{
  const ok = await call(cookie, 'POST', '/api/qrcodes', { title: ' Single ', destinationUrl: 'single.example.com' });
  check('still creates a code, trimmed + https added', ok.status === 201 && ok.json?.qrcode?.title === 'Single' && ok.json?.qrcode?.destinationUrl === 'https://single.example.com', ok.json);
  check('missing title -> 400', (await call(cookie, 'POST', '/api/qrcodes', { destinationUrl: 'a.com' })).status === 400);
  check('http URL -> 400', (await call(cookie, 'POST', '/api/qrcodes', { title: 'x', destinationUrl: 'http://a.com' })).status === 400);
  const long = await call(cookie, 'POST', '/api/qrcodes', { title: 'x'.repeat(300), destinationUrl: 'a.com' });
  check('300-char title -> 400 instead of a 500 (previously unchecked)', long.status === 400, long.status);
  const obj = await call(cookie, 'POST', '/api/qrcodes', { title: { a: 1 }, destinationUrl: 'a.com' });
  check('non-string title -> 400', obj.status === 400, obj.status);
  await call(cookie, 'DELETE', `/api/qrcodes/${ok.json.qrcode.id}`);
}

console.log('Concurrency: two simultaneous batches cannot both slip under the limit');
{
  const c2 = await register(`bulk-d-${stamp}@example.com`);
  const [x, y] = await Promise.all([
    call(c2, 'POST', '/api/qrcodes/bulk', { rows: rows(3, 'x') }),
    call(c2, 'POST', '/api/qrcodes/bulk', { rows: rows(3, 'y') }),
  ]);
  const statuses = [x.status, y.status].sort();
  check('exactly one of the two succeeds (201 + 403)', statuses.join() === '201,403', statuses);
  const uid = Number(sql(`SELECT id FROM users WHERE email='bulk-d-${stamp}@example.com'`));
  check('account has 3 codes, not 6', sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${uid} AND deleted_at IS NULL`) === '3');
}

console.log('Enterprise: unlimited package still capped per request, and throttled per hour');
{
  const e = await register(`bulk-e-${stamp}@example.com`);
  sql(`UPDATE users SET package='enterprise' WHERE email='bulk-e-${stamp}@example.com'`);
  const big = await call(e, 'POST', '/api/qrcodes/bulk', { rows: rows(200, 'big') });
  check('200 rows succeed on Enterprise', big.status === 201 && big.json?.created === 200, big.status);
  const eid = Number(sql(`SELECT id FROM users WHERE email='bulk-e-${stamp}@example.com'`));
  check('200 codes + 200 history rows persisted', sql(`SELECT COUNT(*) FROM qrcode_destinations d JOIN qrcodes q ON q.id=d.qrcode_id WHERE q.user_id=${eid}`) === '200');
  const ids = big.json.qrcodes.map((q) => q.id);
  const undo = await call(e, 'POST', '/api/qrcodes/bulk/trash', { ids });
  check('200-code undo (move to Trash) works', undo.json?.trashed === 200, undo.json);
  // 1 batch (the 200-row one) used so far on this account; 19 more allowed (moving to Trash is not a batch)
  let last;
  for (let i = 0; i < 19; i++) last = await call(e, 'POST', '/api/qrcodes/bulk', { rows: rows(1, `t${i}`) });
  check('20th batch in the hour still allowed', last.status === 201, last.status);
  const throttled = await call(e, 'POST', '/api/qrcodes/bulk', { rows: rows(1, 'over') });
  check('21st batch -> 429 with Retry-After', throttled.status === 429 && Number(throttled.headers.get('retry-after')) > 0, { s: throttled.status, h: throttled.headers.get('retry-after') });
  const invalid = await call(e, 'POST', '/api/qrcodes/bulk', { rows: [{ title: '', destinationUrl: '' }] });
  check('while throttled, requests are refused before any work', invalid.status === 429, invalid.status);
}

finish();
