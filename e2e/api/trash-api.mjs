// Trash / restore / delete-forever endpoints: ownership, idempotency, the package
// limit (including races), batching, request validation and expiry.
import { createRequire } from 'node:module';
import { api as call, check, finish, register, scan, sleep, sql, stamp } from '../lib/harness.mjs';

const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ title: `${tag}${i + 1}`, destinationUrl: `${tag}${i + 1}.example.com` }));
const live = (uid) => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${uid} AND deleted_at IS NULL`));
const trashed = (uid) => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${uid} AND deleted_at IS NOT NULL`));
const exists = (id) => sql(`SELECT COUNT(*) FROM qrcodes WHERE id=${id}`) === '1';
const uidOf = (email) => Number(sql(`SELECT id FROM users WHERE email='${email}'`));

console.log('Unauthenticated');
for (const [m, p, b] of [['POST', '/api/qrcodes/bulk/trash', { ids: [1] }], ['POST', '/api/qrcodes/bulk/restore', { ids: [1] }], ['POST', '/api/qrcodes/bulk/purge', { ids: [1] }], ['GET', '/api/qrcodes/trash']]) {
  check(`${m} ${p} -> 401`, (await call(null, m, p, b)).status === 401);
}

const email = `trash-${stamp}@example.com`;
const cookie = await register(email); const uid = uidOf(email);
sql(`UPDATE users SET package='business' WHERE id=${uid}`);
const made = (await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(6, 'A') })).json.qrcodes;
const [A1, A2, A3, A4] = made;
for (const c of [A1, A2]) { await scan(c.shortId); await scan(c.shortId); }
await sleep(1500);

console.log('Move to Trash');
{
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids: [A1.id, A2.id] });
  check('trashes 2', r.status === 200 && r.json.trashed === 2 && r.json.skipped === 0, r.json);
  const list = (await call(cookie, 'GET', '/api/qrcodes')).json.qrcodes.map((q) => q.title);
  check('gone from the list', !list.includes('A1') && !list.includes('A2') && list.length === 4, list);
  const stats = (await call(cookie, 'GET', '/api/user/stats')).json;
  check('stats: 4 live, 2 in Trash', stats.totalQRCodes === 4 && stats.trashedQRCodes === 2, stats);
  const rd = await scan(A1.shortId);
  check('its link now goes to not-found', /code-unavailable\?reason=not-found/.test(rd.location || ''), rd);

  const t = (await call(cookie, 'GET', '/api/qrcodes/trash')).json;
  check('Trash lists the 2 with full client shape', t.qrcodes.length === 2 && t.qrcodes[0].shortId && t.qrcodes[0].styleConfig && t.retentionDays === 30, t);
  check('daysLeft is the full 30 just after deleting (rounded up)', t.qrcodes.every((q) => q.daysLeft === 30), t.qrcodes.map((q) => q.daysLeft));
  check('deletedMinutesAgo is ~0', t.qrcodes.every((q) => q.deletedMinutesAgo === 0), t.qrcodes.map((q) => q.deletedMinutesAgo));
  check('Trash keeps each code\'s scan count', t.qrcodes.every((q) => q.scanCount >= 2), t.qrcodes.map((q) => q.scanCount));

  const again = await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids: [A1.id] });
  check('trashing again is harmless (0 trashed, 1 skipped)', again.json.trashed === 0 && again.json.skipped === 1, again.json);
  const ghost = await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids: [999999999] });
  check('unknown id skipped', ghost.json.trashed === 0 && ghost.json.skipped === 1, ghost.json);
}

console.log("Other users' codes are untouched");
{
  const email2 = `trash2-${stamp}@example.com`; const c2 = await register(email2); const uid2 = uidOf(email2);
  const theirs = (await call(c2, 'POST', '/api/qrcodes/bulk', { rows: rows(2, 'T') })).json.qrcodes;
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids: theirs.map((q) => q.id) });
  check("trashing someone else's codes does nothing", r.json.trashed === 0 && live(uid2) === 2, r.json);
  sql(`UPDATE qrcodes SET deleted_at=CURRENT_TIMESTAMP WHERE id=${theirs[0].id}`);
  const rr = await call(cookie, 'POST', '/api/qrcodes/bulk/restore', { ids: [theirs[0].id] });
  check("restoring someone else's trashed code does nothing", rr.status === 200 && rr.json.restored === 0 && trashed(uid2) === 1, rr.json);
  const pp = await call(cookie, 'POST', '/api/qrcodes/bulk/purge', { ids: [theirs[0].id] });
  check("purging someone else's trashed code does nothing", pp.json.deleted === 0 && exists(theirs[0].id), pp.json);
  const pa = await call(cookie, 'POST', '/api/qrcodes/bulk/purge', { all: true });
  check('"empty trash" only empties MY trash', exists(theirs[0].id) && trashed(uid2) === 1, pa.json);
  const myTrash = (await call(cookie, 'GET', '/api/qrcodes/trash')).json.qrcodes;
  check("someone else's trashed code is not in my Trash list", myTrash.every((q) => q.id !== theirs[0].id));
  // the "empty trash" above deleted MY two trashed codes: recreate them for the next sections
  sql(`DELETE FROM qrcodes WHERE id=${theirs[0].id}`);
}
// A1/A2 were emptied from Trash by the test above — set up fresh ones
const B = (await call(cookie, 'POST', '/api/qrcodes/bulk', { rows: rows(4, 'B') })).json.qrcodes;
for (const c of B.slice(0, 2)) { await scan(c.shortId); await scan(c.shortId); }
await sleep(1500);
await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids: [B[0].id, B[1].id] });

console.log('Restore');
{
  const histBefore = Number(sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${B[0].id}`));
  const r = await call(cookie, 'POST', '/api/qrcodes/bulk/restore', { ids: [B[0].id] });
  check('restores 1 and returns it with a redirectUrl', r.status === 200 && r.json.restored === 1 && r.json.qrcodes[0].redirectUrl.endsWith(`/r/${B[0].shortId}`), r.json);
  const list = (await call(cookie, 'GET', '/api/qrcodes')).json.qrcodes.map((q) => q.title);
  check('back in the list', list.includes('B1'));
  const rd = await scan(B[0].shortId);
  check('the SAME short link redirects again', rd.status === 302 && rd.location?.startsWith('https://B1.example.com'.toLowerCase()), rd);
  check('scan history intact', Number(sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${B[0].id}`)) >= histBefore);
  const live1 = await call(cookie, 'POST', '/api/qrcodes/bulk/restore', { ids: [B[0].id, B[3].id] });
  check('restoring live codes is a no-op', live1.json.restored === 0 && live1.json.qrcodes.length === 0, live1.json);
}

console.log('Restore is checked against the package limit (Starter, limit 5), all or nothing');
{
  const e3 = `trash3-${stamp}@example.com`; const c3 = await register(e3); const u3 = uidOf(e3);
  const mk = (await call(c3, 'POST', '/api/qrcodes/bulk', { rows: rows(5, 'S') })).json.qrcodes;
  await call(c3, 'POST', '/api/qrcodes/bulk/trash', { ids: mk.map((q) => q.id) });
  check('5 trashed, 0 live', trashed(u3) === 5 && live(u3) === 0);
  const fill = (await call(c3, 'POST', '/api/qrcodes/bulk', { rows: rows(3, 'F') }));
  check('trashing freed the room: 3 new codes created', fill.status === 201, fill.status);
  const tooMany = await call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: mk.slice(0, 3).map((q) => q.id) });
  check('restoring 3 into 2 free slots is refused', tooMany.status === 403 && tooMany.json.code === 'PACKAGE_LIMIT_REACHED' && tooMany.json.remaining === 2 && tooMany.json.requested === 3 && tooMany.json.limit === 5, tooMany.json);
  check('message tells them how many fit', /room for 2 more codes, but 3 were selected/.test(tooMany.json.error), tooMany.json.error);
  check('nothing restored (all or nothing)', live(u3) === 3 && trashed(u3) === 5, { live: live(u3), trashed: trashed(u3) });
  const two = await call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: mk.slice(0, 2).map((q) => q.id) });
  check('restoring exactly the room left works', two.status === 200 && two.json.restored === 2 && live(u3) === 5, two.json);
  const full = await call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: [mk[2].id] });
  check('full account: refused with the "reached" message', full.status === 403 && full.json.remaining === 0 && /reached your package limit of 5/.test(full.json.error), full.json);
  // ids that are not in Trash don't count toward "requested"
  const mixed = await call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: [mk[0].id, mk[2].id] });
  check('only trashed ids are counted as requested', mixed.status === 403 && mixed.json.requested === 1, mixed.json);

  // race: one free slot, two restores at once
  await call(c3, 'POST', '/api/qrcodes/bulk/trash', { ids: [mk[0].id] });
  check('one slot free', live(u3) === 4);
  const [x, y] = await Promise.all([
    call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: [mk[2].id] }),
    call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: [mk[3].id] }),
  ]);
  check('two simultaneous restores into one slot: exactly one wins', [x.status, y.status].sort().join() === '200,403', [x.status, y.status]);
  check('the account never exceeds its limit', live(u3) === 5, live(u3));
  // restore vs create
  await call(c3, 'POST', '/api/qrcodes/bulk/trash', { ids: [mk[1].id] });
  const [rs, cr] = await Promise.all([
    call(c3, 'POST', '/api/qrcodes/bulk/restore', { ids: [mk[1].id] }),
    call(c3, 'POST', '/api/qrcodes', { title: 'race', destinationUrl: 'race.example.com' }),
  ]);
  check('restore racing a create: exactly one wins', [rs.status, cr.status].filter((s) => s < 300).length === 1, [rs.status, cr.status]);
  check('still within the limit', live(u3) <= 5, live(u3));
}

console.log('Delete forever');
{
  const e4 = `trash4-${stamp}@example.com`; const c4 = await register(e4); const u4 = uidOf(e4);
  sql(`UPDATE users SET package='enterprise' WHERE id=${u4}`);
  const mk = (await call(c4, 'POST', '/api/qrcodes/bulk', { rows: rows(6, 'P') })).json.qrcodes;
  for (const c of mk.slice(0, 2)) { await scan(c.shortId); }
  await sleep(1500);
  await call(c4, 'POST', '/api/qrcodes/bulk/trash', { ids: [mk[0].id, mk[1].id, mk[2].id] });

  const live1 = await call(c4, 'POST', '/api/qrcodes/bulk/purge', { ids: [mk[3].id, mk[4].id] });
  check('REFUSES live codes (0 deleted, they still exist)', live1.json.deleted === 0 && exists(mk[3].id) && exists(mk[4].id), live1.json);
  const mixed = await call(c4, 'POST', '/api/qrcodes/bulk/purge', { ids: [mk[0].id, mk[3].id] });
  check('a mix deletes only the trashed one', mixed.json.deleted === 1 && !exists(mk[0].id) && exists(mk[3].id), mixed.json);
  check('its scan history and destination history went with it', sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${mk[0].id}`) === '0' && sql(`SELECT COUNT(*) FROM qrcode_destinations WHERE qrcode_id=${mk[0].id}`) === '0');
  check('a purged link is gone for good (not-found)', /not-found/.test((await scan(mk[0].shortId)).location || ''));

  for (const [name, body] of [['no body fields', {}], ['all:"yes"', { all: 'yes' }], ['all:1', { all: 1 }], ['all:false', { all: false }], ['all + ids', { all: true, ids: [mk[3].id] }]]) {
    const r = await call(c4, 'POST', '/api/qrcodes/bulk/purge', body);
    check(`purge rejects ${name} (400)`, r.status === 400, r);
  }
  check('nothing was deleted by those bad requests', exists(mk[1].id) && exists(mk[2].id) && exists(mk[3].id));

  const all = await call(c4, 'POST', '/api/qrcodes/bulk/purge', { all: true });
  check('{ all: true } empties Trash (2 left in it)', all.json.deleted === 2 && !exists(mk[1].id) && !exists(mk[2].id), all.json);
  check('and leaves every live code alone', live(u4) === 3 && exists(mk[3].id) && exists(mk[4].id) && exists(mk[5].id));
  const empty = await call(c4, 'POST', '/api/qrcodes/bulk/purge', { all: true });
  check('emptying an empty Trash is harmless', empty.json.deleted === 0);

  // big purge in batches
  const big = (await call(c4, 'POST', '/api/qrcodes/bulk', { rows: rows(200, 'Z') })).json.qrcodes;
  await call(c4, 'POST', '/api/qrcodes/bulk/trash', { ids: big.map((q) => q.id) });
  const bp = await call(c4, 'POST', '/api/qrcodes/bulk/purge', { all: true });
  check('200 codes purged across several batches', bp.json.deleted === 200 && trashed(u4) === 0, bp.json);
}

console.log('Request validation (same rules on all three)');
for (const ep of ['trash', 'restore', 'purge']) {
  const p = `/api/qrcodes/bulk/${ep}`;
  check(`${ep}: empty ids -> 400`, (await call(cookie, 'POST', p, { ids: [] })).status === 400);
  check(`${ep}: missing ids -> 400`, (await call(cookie, 'POST', p, {})).status === 400);
  check(`${ep}: string id -> 400`, (await call(cookie, 'POST', p, { ids: ['1'] })).status === 400);
  check(`${ep}: negative id -> 400`, (await call(cookie, 'POST', p, { ids: [-1] })).status === 400);
  check(`${ep}: 501 ids -> 400`, (await call(cookie, 'POST', p, { ids: Array.from({ length: 501 }, (_, i) => i + 1) })).status === 400);
  check(`${ep}: bad JSON -> 400`, (await call(cookie, 'POST', p, undefined, '{nope')).status === 400);
  check(`${ep}: oversized body -> 413`, (await call(cookie, 'POST', p, { ids: [1], junk: 'x'.repeat(100000) })).status === 413);
}
{
  const ok500 = await call(cookie, 'POST', '/api/qrcodes/bulk/trash', { ids: Array.from({ length: 500 }, (_, i) => 900000000 + i) });
  check('exactly 500 ids is accepted', ok500.status === 200 && ok500.json.skipped === 500, ok500.status);
}

console.log('Expiry: viewing Trash purges what is older than 30 days');
{
  const e5 = `trash5-${stamp}@example.com`; const c5 = await register(e5); const u5 = uidOf(e5);
  const mk = (await call(c5, 'POST', '/api/qrcodes/bulk', { rows: rows(4, 'X') })).json.qrcodes;
  await call(c5, 'POST', '/api/qrcodes/bulk/trash', { ids: mk.map((q) => q.id) });
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 31 DAY WHERE id=${mk[0].id}`);
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 29 DAY - INTERVAL 23 HOUR WHERE id=${mk[1].id}`);
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 10 DAY WHERE id=${mk[2].id}`);
  const t = (await call(c5, 'GET', '/api/qrcodes/trash')).json.qrcodes;
  check('the 31-day-old code was purged on view', !exists(mk[0].id) && !t.some((q) => q.id === mk[0].id));
  const byId = Object.fromEntries(t.map((q) => [q.id, q]));
  check('29d23h old: kept, 1 day left', byId[mk[1].id]?.daysLeft === 1, byId[mk[1].id]);
  check('10 days old: 20 days left, age ~14400 minutes', byId[mk[2].id]?.daysLeft === 20 && Math.abs(byId[mk[2].id].deletedMinutesAgo - 14400) <= 2, byId[mk[2].id]);
  check('just-deleted: 30 days left', byId[mk[3].id]?.daysLeft === 30);
  check('ordered most recently deleted first', t.map((q) => q.id).join() === [mk[3].id, mk[2].id, mk[1].id].join(), t.map((q) => q.id));
}

console.log('Expiry: the global purge that daily housekeeping runs (every account, nobody opening Trash)');
{
  const db = createRequire(import.meta.url)('../../src/lib/db.js');
  try {
    const e6 = `trash6-${stamp}@example.com`; const c6 = await register(e6); const u6 = uidOf(e6);
    const mk = (await call(c6, 'POST', '/api/qrcodes/bulk', { rows: rows(3, 'H') })).json.qrcodes;
    await call(c6, 'POST', '/api/qrcodes/bulk/trash', { ids: [mk[0].id, mk[1].id] });
    sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 31 DAY WHERE id=${mk[0].id}`);
    sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 5 DAY WHERE id=${mk[1].id}`);
    const purged = await db.purgeExpiredTrash({ retentionDays: 30 });
    check('deletes the code that has been in Trash 31 days, without anyone opening Trash', !exists(mk[0].id));
    check('keeps the 5-day-old one in Trash', exists(mk[1].id) && trashed(u6) === 1);
    check('and the live code', live(u6) === 1);
    check('reports how many it deleted', purged >= 1, purged);
    const rejected = await db.purgeExpiredTrash({ retentionDays: 0 }).then(() => false, () => true);
    check('rejects a nonsense retention period', rejected);
  } finally {
    await db.pool.end();
  }
}

finish();
