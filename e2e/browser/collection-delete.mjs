// Deleting a collection, optionally moving its codes to Trash: the API (ownership, atomicity,
// codes already in Trash) and the confirmation dialog.
import path from 'node:path';
import { api, artifactsFor, check, config, cookieFor, finish, launchBrowser, register, run, sql, stamp } from '../lib/harness.mjs';

const OUT = artifactsFor('collection-delete');
const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ title: `${tag} ${i + 1}`, destinationUrl: `${tag.toLowerCase()}${i + 1}.example.com` }));
const col = async (u, name) => (await api(u, 'POST', '/api/collections', { name })).json.collection;
const codes = async (u, collectionId, n, tag) => (await api(u, 'POST', '/api/qrcodes/bulk', { rows: rows(n, tag), collectionId })).json.qrcodes;
const state = (id) => sql(`SELECT collection_id IS NULL, deleted_at IS NULL FROM qrcodes WHERE id=${id}`).split('\t').map((x) => x === '1');

run(async () => {
  const U = await register(`cd-${stamp}@example.com`, { pkg: 'enterprise' });

  console.log('Default behaviour is unchanged (codes go to Default, nothing is trashed)');
  {
    const c = await col(U, `Plain ${stamp}`);
    const live3 = await codes(U, c.id, 3, 'P');
    const gone = (await codes(U, c.id, 1, 'PT'))[0];
    await api(U, 'POST', '/api/qrcodes/bulk/trash', { ids: [gone.id] });
    const r = await api(U, 'DELETE', `/api/collections/${c.id}`);
    check('200 and no codes trashed', r.status === 200 && Array.isArray(r.json.trashedIds) && r.json.trashedIds.length === 0, r.json);
    check('the 3 codes are live and in Default', live3.every((q) => { const [inDefault, isLive] = state(q.id); return inDefault && isLive; }));
    check('the already-trashed one stays trashed (and also falls back to Default)', (() => { const [d, l] = state(gone.id); return d && !l; })());
    const r2 = await api(U, 'DELETE', `/api/collections/${c.id}`);
    check('deleting it again -> 404', r2.status === 404);
  }

  console.log('?trashCodes=1 moves exactly the live codes to Trash, atomically with the delete');
  {
    const c = await col(U, `Trashy ${stamp}`);
    const other = await col(U, `Other ${stamp}`);
    const live3 = await codes(U, c.id, 3, 'T');
    const earlier = (await codes(U, c.id, 1, 'TE'))[0];
    const keep2 = await codes(U, other.id, 2, 'K');
    await api(U, 'POST', '/api/qrcodes/bulk/trash', { ids: [earlier.id] });
    sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 5 DAY WHERE id=${earlier.id}`);
    const before = sql(`SELECT deleted_at FROM qrcodes WHERE id=${earlier.id}`);
    const r = await api(U, 'DELETE', `/api/collections/${c.id}?trashCodes=1`);
    check('200 with the 3 live ids', r.status === 200 && [...r.json.trashedIds].sort().join() === live3.map((q) => q.id).sort().join(), r.json);
    check('they are in Trash', live3.every((q) => { const [, isLive] = state(q.id); return !isLive; }));
    check('and no longer reference the deleted collection', live3.every((q) => state(q.id)[0]));
    check('the code already in Trash was not touched (same deleted_at)', sql(`SELECT deleted_at FROM qrcodes WHERE id=${earlier.id}`) === before);
    check('the collection is gone', sql(`SELECT COUNT(*) FROM collections WHERE id=${c.id}`) === '0');
    check("another collection's codes are untouched", keep2.every((q) => { const [inDefault, isLive] = state(q.id); return !inDefault && isLive; }));
    const restored = await api(U, 'POST', '/api/qrcodes/bulk/restore', { ids: r.json.trashedIds });
    check('restoring them puts them live in Default', restored.json.restored === 3 && live3.every((q) => { const [d, l] = state(q.id); return d && l; }), restored.json);
  }

  console.log('Other values and edge cases');
  {
    const c = await col(U, `Edge ${stamp}`);
    const cs = await codes(U, c.id, 2, 'E');
    const r = await api(U, 'DELETE', `/api/collections/${c.id}?trashCodes=0`);
    check('?trashCodes=0 does not trash', r.json.trashedIds.length === 0 && cs.every((q) => state(q.id)[1]), r.json);
    const c2 = await col(U, `Edge2 ${stamp}`);
    const cs2 = await codes(U, c2.id, 2, 'E2');
    const r2 = await api(U, 'DELETE', `/api/collections/${c2.id}?trashCodes=yes`);
    check('only the exact value 1 trashes (?trashCodes=yes does not)', r2.json.trashedIds.length === 0 && cs2.every((q) => state(q.id)[1]), r2.json);
    const c3 = await col(U, `Empty ${stamp}`);
    const r3 = await api(U, 'DELETE', `/api/collections/${c3.id}?trashCodes=1`);
    check('an empty collection deletes fine', r3.status === 200 && r3.json.trashedIds.length === 0, r3.json);
    const big = await col(U, `Big ${stamp}`);
    const bigCodes = await codes(U, big.id, 200, 'B');
    const rb = await api(U, 'DELETE', `/api/collections/${big.id}?trashCodes=1`);
    check('200 codes trashed in one go', rb.json.trashedIds.length === 200 && sql(`SELECT COUNT(*) FROM qrcodes WHERE id IN (${bigCodes.map((q) => q.id).join(',')}) AND deleted_at IS NULL`) === '0', rb.json.trashedIds.length);
    await api(U, 'POST', '/api/qrcodes/bulk/purge', { all: true });
  }

  console.log("Someone else's collection cannot be used to trash codes");
  {
    const V = await register(`cd2-${stamp}@example.com`, { pkg: 'enterprise' });
    const theirs = await col(V, `Theirs ${stamp}`);
    const theirCodes = await codes(V, theirs.id, 2, 'V');
    const r = await api(U, 'DELETE', `/api/collections/${theirs.id}?trashCodes=1`);
    check('404', r.status === 404, r);
    check('their codes and collection are untouched', theirCodes.every((q) => { const [inDefault, isLive] = state(q.id); return !inDefault && isLive; }) && sql(`SELECT COUNT(*) FROM collections WHERE id=${theirs.id}`) === '1');
    const nologin = await fetch(`${config.baseUrl}/api/collections/${theirs.id}?trashCodes=1`, { method: 'DELETE' });
    check('unauthenticated -> 401 and nothing changes', nologin.status === 401 && theirCodes.every((q) => state(q.id)[1]));
  }

  console.log('The dialog');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([cookieFor(U)]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  let nativeDialog = null;
  page.on('dialog', async (d) => { nativeDialog = d.message(); await d.dismiss(); });
  const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' }); };
  // (bound to `pg`, the page created below for the browser part's own user)
  const pill = (name) => pg.locator(`button.glass-card-static:has-text("${name}")`);
  const pillNum = async (label) => Number((await pg.locator(`button.glass-card-static:has-text("${label}")`).first().textContent()).replace(/\D/g, ''));

  // a clean slate for the browser part
  const W = await register(`cd3-${stamp}@example.com`, { pkg: 'extended' });
  const cA = await col(W, `Clients ${stamp}`);
  const cB = await col(W, `Plain ${stamp}`);
  const cEmpty = await col(W, `Nothing ${stamp}`);
  await codes(W, cA.id, 3, 'Client');
  await codes(W, cB.id, 2, 'Plain');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addCookies([cookieFor(W)]);
  await ctx.close();
  const pg = await ctx2.newPage();
  pg.on('dialog', async (d) => { nativeDialog = d.message(); await d.dismiss(); });
  pg.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e));
  const snap = async (name) => { await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' }); };
  await pg.goto(`${config.baseUrl}/dashboard`);
  await pg.waitForSelector('#trash-pill');
  await pg.waitForTimeout(400);

  await pg.click(`button.glass-card-static:has-text("Clients ${stamp}")`);
  await pg.waitForTimeout(300);
  await pg.click('button:has-text("Delete")');
  await pg.waitForSelector('#confirm-action-title');
  check('dialog title names the collection', (await pg.textContent('#confirm-action-title')).includes(`Delete the “Clients ${stamp}” collection?`));
  const body = await pg.textContent('.modal-card');
  check('says the 3 codes move to Default', body.includes('Its 3 codes won’t be deleted: they will move to the Default collection.'), body);
  check('the Trash option is offered and OFF by default', (await pg.isVisible('#collection-trash-codes')) && !(await pg.isChecked('#collection-trash-codes')));
  check('button reads Delete collection', await pg.isVisible('.modal-card button:has-text("Delete collection")'));
  await pg.check('#collection-trash-codes');
  check('ticking it changes the button to name the count', await pg.isVisible('.modal-card button:has-text("Delete and move 3 to Trash")'));
  check('and explains the 30 days', (await pg.textContent('.modal-card')).includes('can be restored from Trash for 30 days'));
  await snap('01-collection-dialog');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(200);
  check('Escape cancels: the collection still exists', (await pill(`Clients ${stamp}`).count()) === 1 && sql(`SELECT COUNT(*) FROM collections WHERE id=${cA.id}`) === '1');

  await pg.click('button:has-text("Delete")');
  await pg.waitForSelector('#confirm-action-title');
  check('re-opening starts unticked again', !(await pg.isChecked('#collection-trash-codes')));
  await pg.check('#collection-trash-codes');
  await pg.click('.modal-card button:has-text("Delete and move 3 to Trash")');
  await pg.waitForSelector('#undo-toast');
  await pg.waitForTimeout(400);
  check('the collection pill is gone', (await pill(`Clients ${stamp}`).count()) === 0);
  check('the 3 codes are in Trash', Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${W.userId} AND deleted_at IS NOT NULL`)) === 3);
  check('the Trash pill shows 3', (await pillNum('Trash')) === 3, await pillNum('Trash'));
  const toastText = await pg.textContent('#undo-toast');
  check('toast says what happened', toastText.includes(`Deleted “Clients ${stamp}” and moved 3 QR codes to Trash`), toastText);
  await snap('02-collection-trashed-toast');
  await pg.click('#undo-toast-btn');
  await pg.waitForSelector('text=to the Default collection.');
  await pg.waitForTimeout(400);
  check('Undo restores them to the Default collection', (await pg.textContent('#undo-toast')).includes('Restored 3 QR codes to the Default collection.'));
  check('Default now holds 3 (and Trash 0)', (await pillNum('Default')) === 3 && (await pillNum('Trash')) === 0, { def: await pillNum('Default'), trash: await pillNum('Trash') });

  console.log('Without the box ticked: as before, and no popup');
  await pg.waitForSelector('#undo-toast', { state: 'detached', timeout: 15000 });
  await pg.click(`button.glass-card-static:has-text("Plain ${stamp}")`);
  await pg.waitForTimeout(300);
  await pg.click('button:has-text("Delete")');
  await pg.waitForSelector('#confirm-action-title');
  await pg.click('.modal-card button:has-text("Delete collection")');
  await pg.waitForTimeout(800);
  check('the collection is gone', (await pill(`Plain ${stamp}`).count()) === 0);
  check('its 2 codes moved to Default (now 5 there), none trashed', (await pillNum('Default')) === 5 && Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${W.userId} AND deleted_at IS NOT NULL`)) === 0);
  check('no popup (nothing to undo)', (await pg.locator('#undo-toast').count()) === 0);

  console.log('An empty collection');
  await pg.click(`button.glass-card-static:has-text("Nothing ${stamp}")`);
  await pg.waitForTimeout(300);
  await pg.click('button:has-text("Delete")');
  await pg.waitForSelector('#confirm-action-title');
  check('says it has no codes and offers no Trash option', (await pg.textContent('.modal-card')).includes('This collection has no codes.') && (await pg.locator('#collection-trash-codes').count()) === 0);
  await pg.click('.modal-card button:has-text("Delete collection")');
  await pg.waitForTimeout(600);
  check('deleted', (await pill(`Nothing ${stamp}`).count()) === 0);

  check('no native browser dialogs were used', nativeDialog === null, nativeDialog);
  check('no console errors', consoleErrors.length === 0, consoleErrors);
  await browser.close();
  finish();
});
