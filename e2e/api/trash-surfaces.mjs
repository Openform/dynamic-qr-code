// Every place that reads codes: a trashed code must behave like a deleted one
// (list, stats, limits, redirect, analytics, exports, admin views) and come back
// intact on restore.
import { api as call, check, config, finish, register, registerOrLogin, scan, sleep, sql, stamp, waitFor } from '../lib/harness.mjs';

const cookie = await register(`surf-${stamp}@example.com`);
const userId = Number(sql(`SELECT id FROM users WHERE email='surf-${stamp}@example.com'`));
sql(`UPDATE users SET package='business' WHERE id=${userId}`);
const col = (await call(cookie, 'POST', '/api/collections', { name: `Col ${stamp}` })).json.collection;

const mk = async (title, url) => (await call(cookie, 'POST', '/api/qrcodes', { title, destinationUrl: url, collectionId: col.id })).json.qrcode;
const A = await mk('Trash-me', 'a.example.com/page');
const B = await mk('Keep-me', 'b.example.com/page');
const humanScans = (id) => Number(sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${id} AND is_bot=0`));

console.log('Setup: 3 scans of A, 2 of B through the real redirect');
for (let i = 0; i < 3; i++) await scan(A.shortId);
for (let i = 0; i < 2; i++) await scan(B.shortId);
check('all 5 scans were recorded', await waitFor(() => humanScans(A.id) === 3 && humanScans(B.id) === 2), [humanScans(A.id), humanScans(B.id)]);

const analytics = async (extra = '') => (await call(cookie, 'GET', `/api/analytics?range=all${extra}`));
const titlesIn = (arr) => (arr || []).map((r) => r.codeTitle ?? r.title);

async function snapshot() {
  const list = (await call(cookie, 'GET', '/api/qrcodes')).json.qrcodes.map((q) => q.title);
  const stats = (await call(cookie, 'GET', '/api/user/stats')).json;
  const cols = (await call(cookie, 'GET', '/api/collections')).json.collections.find((c) => c.id === col.id);
  const an = (await analytics()).json;
  const anCol = (await analytics(`&collectionId=${col.id}`)).json;
  const csv = (await call(cookie, 'GET', '/api/analytics/export?range=all')).text;
  return { list, stats, colCount: cols.count, an, anCol, csv };
}

console.log('Before: both codes live');
{
  const s = await snapshot();
  check('list has both', s.list.includes('Trash-me') && s.list.includes('Keep-me'), s.list);
  check('stats: 2 codes, 5 scans', s.stats.totalQRCodes === 2 && s.stats.totalScans === 5, s.stats);
  check('collection count 2', s.colCount === 2, s.colCount);
  check('analytics summary: 5 scans', s.an.summary.scans === 5, s.an.summary);
  check('top codes lists both', ['Trash-me', 'Keep-me'].every((t) => titlesIn(s.an.topCodes).includes(t)), s.an.topCodes);
  check('recent scans include A', titlesIn(s.an.recent).includes('Trash-me'));
  check('collection-scoped analytics: 5 scans', s.anCol.summary.scans === 5, s.anCol.summary);
  check('CSV export includes A', s.csv.includes('Trash-me'));
  check('redirect works for A', (await scan(A.shortId)).location?.startsWith('https://a.example.com'));
  await waitFor(() => humanScans(A.id) === 4);
  check('that extra scan counted', humanScans(A.id) === 4);
}

console.log('Trash A (set deleted_at) and check every surface');
sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP WHERE id=${A.id}`);
const scanCountBefore = Number(sql(`SELECT scan_count FROM qrcodes WHERE id=${A.id}`));
const eventsBefore = Number(sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${A.id}`));
{
  const s = await snapshot();
  check('list excludes A, keeps B', !s.list.includes('Trash-me') && s.list.includes('Keep-me'), s.list);
  check('stats count only B (1 code, 2 scans)', s.stats.totalQRCodes === 1 && s.stats.totalScans === 2, s.stats);
  check('collection count excludes A', s.colCount === 1, s.colCount);
  check('analytics summary excludes A scans (2, not 6)', s.an.summary.scans === 2, s.an.summary);
  check('untracked scans not inflated by A (all-time total excludes A)', s.an.summary.untrackedScans === 0, s.an.summary);
  check('top codes exclude A', !titlesIn(s.an.topCodes).includes('Trash-me') && titlesIn(s.an.topCodes).includes('Keep-me'), s.an.topCodes);
  check('recent scans exclude A', !titlesIn(s.an.recent).includes('Trash-me'), s.an.recent);
  check('collection-scoped analytics exclude A', s.anCol.summary.scans === 2, s.anCol.summary);
  check('CSV export excludes A', !s.csv.includes('Trash-me') && s.csv.includes('Keep-me'));

  check('GET /api/qrcodes/[id] -> 404', (await call(cookie, 'GET', `/api/qrcodes/${A.id}`)).status === 404);
  check('PUT /api/qrcodes/[id] -> 404', (await call(cookie, 'PUT', `/api/qrcodes/${A.id}`, { title: 'x' })).status === 404);
  check('image route -> 404', (await call(cookie, 'GET', `/api/qrcodes/${A.id}/image`)).status === 404);
  const an404 = await analytics(`&codeId=${A.id}`);
  check('per-code analytics -> 404', an404.status === 404, an404.status);
  const csv404 = await call(cookie, 'GET', `/api/analytics/export?range=all&codeId=${A.id}`);
  check('per-code CSV export -> 404', csv404.status === 404, csv404.status);

  const r = await scan(A.shortId);
  check('redirect sends A to the not-found page', r.status === 302 && /code-unavailable\?reason=not-found/.test(r.location || ''), r);
  await sleep(1200);
  check('no scan recorded for the trashed code', Number(sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${A.id}`)) === eventsBefore);
  check('its scan_count did not move', Number(sql(`SELECT scan_count FROM qrcodes WHERE id=${A.id}`)) === scanCountBefore);
  const rb = await scan(B.shortId);
  check('B still redirects', rb.status === 302 && rb.location?.startsWith('https://b.example.com'), rb);
}

console.log('Admin views');
{
  const admin = config.adminEmail ? await registerOrLogin(config.adminEmail, { name: 'Admin' }) : null;
  if (!admin) {
    console.log('  (skipped: ADMIN_EMAILS is not set, or that account already exists with another password)');
  } else {
    const accounts = (await call(admin, 'GET', '/api/admin/accounts')).json;
    const mine = (accounts.accounts || accounts).find((a) => a.id === userId);
    check('admin account summary counts only live codes (1)', mine?.codeCount === 1, mine);
    check('admin per-code analytics for trashed code -> 404', (await call(admin, 'GET', `/api/admin/analytics?range=all&codeId=${A.id}`)).status === 404);
    const adminAll = (await call(admin, 'GET', `/api/admin/analytics?range=all&accountId=${userId}`)).json;
    check("admin account analytics = B's scans only, per the database", adminAll.summary.scans === humanScans(B.id), { api: adminAll.summary.scans, db: humanScans(B.id) });
  }
}

console.log('Package limit ignores trashed codes (Starter, limit 5)');
{
  const c2 = await register(`surf-s-${stamp}@example.com`);
  const rows = Array.from({ length: 5 }, (_, i) => ({ title: `s${i}`, destinationUrl: `s${i}.example.com` }));
  const made = await call(c2, 'POST', '/api/qrcodes/bulk', { rows });
  check('5 codes created (at the limit)', made.status === 201, made.status);
  check('6th refused at the limit', (await call(c2, 'POST', '/api/qrcodes', { title: 'x', destinationUrl: 'x.example.com' })).status === 403);
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP WHERE id=${made.json.qrcodes[0].id}`);
  const after = await call(c2, 'POST', '/api/qrcodes', { title: 'room', destinationUrl: 'room.example.com' });
  check('single create works once one is trashed', after.status === 201, after.json);
  const bulk = await call(c2, 'POST', '/api/qrcodes/bulk', { rows: [{ title: 'z', destinationUrl: 'z.example.com' }] });
  check('and the limit applies again to live codes (bulk refused)', bulk.status === 403 && bulk.json?.remaining === 0, bulk.json);
  const me = (await call(c2, 'GET', '/api/user/stats')).json;
  check('stats show 5 live codes, not 6', me.totalQRCodes === 5, me);
}

console.log('Restore (clear deleted_at): everything comes back, history intact');
sql(`UPDATE qrcodes SET deleted_at = NULL WHERE id=${A.id}`);
{
  const s = await snapshot();
  check('list has A again', s.list.includes('Trash-me'));
  const dbScans = Number(sql(`SELECT SUM(scan_count) FROM qrcodes WHERE user_id=${userId}`));
  check('stats back to 2 codes and every scan, per the database', s.stats.totalQRCodes === 2 && s.stats.totalScans === dbScans, { stats: s.stats, dbScans });
  check('collection count 2', s.colCount === 2);
  check('analytics back to every scan row, same history', s.an.summary.scans === humanScans(A.id) + humanScans(B.id), { api: s.an.summary.scans, db: humanScans(A.id) + humanScans(B.id) });
  check('A in top codes and recent scans again', titlesIn(s.an.topCodes).includes('Trash-me') && titlesIn(s.an.recent).includes('Trash-me'));
  check('the SAME short link redirects again', (await scan(A.shortId)).location?.startsWith('https://a.example.com'));
  check('scan history rows were never touched', Number(sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${A.id}`)) >= eventsBefore);
}

console.log('Deleting a collection with a trashed member');
{
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP WHERE id=${A.id}`);
  const del = await call(cookie, 'DELETE', `/api/collections/${col.id}`);
  check('collection deleted', del.status === 200, del.status);
  check('trashed code fell back to Default (collection_id NULL)', sql(`SELECT collection_id IS NULL FROM qrcodes WHERE id=${A.id}`) === '1');
  check('live code too', sql(`SELECT collection_id IS NULL FROM qrcodes WHERE id=${B.id}`) === '1');
}

finish();
