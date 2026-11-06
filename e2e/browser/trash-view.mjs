// The Trash view: list and countdowns, restore (one and several), delete forever and Empty
// Trash with typed confirmation, the package limit on restore, moving between views.
import path from 'node:path';
import { api, artifactsFor, check, config, cookieFor, finish, launchBrowser, register, run, scan, sleep, sql, stamp } from '../lib/harness.mjs';

const OUT = artifactsFor('trash-view');
const live = (u) => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${u.userId} AND deleted_at IS NULL`));
const inTrash = (u) => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${u.userId} AND deleted_at IS NOT NULL`));
const exists = (id) => sql(`SELECT COUNT(*) FROM qrcodes WHERE id=${id}`) === '1';
const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ title: `${tag} ${i + 1}`, destinationUrl: `${tag.toLowerCase()}${i + 1}.example.com` }));

run(async () => {
  const U = await register(`tv-${stamp}@example.com`, { pkg: 'extended' });
  const made = (await api(U, 'POST', '/api/qrcodes/bulk', { rows: rows(9, 'Code') })).json.qrcodes; // Code 1..9
  const byTitle = Object.fromEntries(made.map((q) => [q.title, q]));
  const [c1, c2, c3, c4, c5] = ['Code 1', 'Code 2', 'Code 3', 'Code 4', 'Code 5'].map((t) => byTitle[t]);
  await scan(c2.shortId); await scan(c2.shortId); await scan(c2.shortId);
  await sleep(1500);
  await api(U, 'POST', '/api/qrcodes/bulk/trash', { ids: [c1, c2, c3, c4, c5].map((q) => q.id) });
  // ages: c1 now, c2 10 days, c3 28 days (2 left), c4 29d23h (1 left), c5 just now
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 10 DAY WHERE id=${c2.id}`);
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 28 DAY WHERE id=${c3.id}`);
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 29 DAY - INTERVAL 23 HOUR WHERE id=${c4.id}`);
  // a code past 30 days: should vanish when Trash is opened
  const old = byTitle['Code 6'];
  await api(U, 'POST', '/api/qrcodes/bulk/trash', { ids: [old.id] });
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP - INTERVAL 31 DAY WHERE id=${old.id}`);

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
  const trashCards = () => page.locator('[data-trashed-code]').count();
  const pillCount = async () => (await page.textContent('#trash-pill')).replace(/\D/g, '');
  const barCount = async () => page.textContent('#selection-bar strong');

  console.log('The Trash pill');
  await page.goto(`${config.baseUrl}/dashboard`);
  await page.waitForSelector('#trash-pill');
  await page.waitForTimeout(400);
  check('pill shows 6 (including the not-yet-purged 31-day-old one)', (await pillCount()) === '6', await pillCount());
  check('stats show only the 3 live codes', (await page.textContent('body')).includes('3 of 50 codes used'));

  console.log('Opening Trash');
  await page.click('#trash-pill');
  await page.waitForSelector('[data-trashed-code]');
  check('the 31-day-old code was purged on opening (5 cards)', (await trashCards()) === 5, await trashCards());
  check('and is gone from the database', !exists(old.id));
  check('the pill now says 5', (await pillCount()) === '5', await pillCount());
  check('search box says Search Trash', (await page.getAttribute('#search-qrcodes', 'placeholder')) === 'Search Trash…');
  check('Select / Bulk create / Create buttons are not offered', (await page.locator('#select-mode-btn, #bulk-create-btn, #create-qr-btn').count()) === 0);
  check('Empty Trash is offered', await page.isVisible('#empty-trash-btn'));
  check('intro explains the 30 days', (await page.textContent('#trash-intro')).includes('30 days'));
  const left = await page.locator('[data-trashed-code]').evaluateAll((els) => els.map((e) => ({ id: Number(e.dataset.trashedCode), days: Number(e.querySelector('[data-days-left]').dataset.daysLeft), text: e.textContent })));
  const days = Object.fromEntries(left.map((l) => [l.id, l.days]));
  check('days left: 30 / 20 / 2 / 1 / 30', days[c1.id] === 30 && days[c2.id] === 20 && days[c3.id] === 2 && days[c4.id] === 1 && days[c5.id] === 30, days);
  check('ordered most recently deleted first', left[left.length - 1].id === c3.id || left[left.length - 1].id === c4.id, left.map((l) => l.id));
  check('each card says how long ago and the countdown', left.every((l) => /Deleted (just now|\d+ (minute|hour|day)s? ago)/.test(l.text) && /Deleted permanently (today|in \d+ days?)/.test(l.text)), left.map((l) => l.text));
  check('the 10-day-old code says 10 days ago', left.find((l) => l.id === c2.id).text.includes('10 days ago'));
  check('and keeps its scan count (3)', left.find((l) => l.id === c2.id).text.includes('3 scans'));
  const urgentColor = await page.locator(`[data-trashed-code="${c3.id}"] [data-days-left]`).evaluate((e) => getComputedStyle(e).color);
  const normalColor = await page.locator(`[data-trashed-code="${c2.id}"] [data-days-left]`).evaluate((e) => getComputedStyle(e).color);
  check('countdown turns to a warning colour at 3 days or fewer', urgentColor !== normalColor && urgentColor === 'rgb(245, 158, 11)', { urgentColor, normalColor });
  await shot('01-trash-view');

  console.log('Search and selection');
  await page.fill('#search-qrcodes', 'Code 3');
  await page.waitForTimeout(300);
  check('search filters the Trash list', (await trashCards()) === 1);
  await page.fill('#search-qrcodes', 'zzz-nothing');
  await page.waitForTimeout(300);
  check('no match shows a message', await page.isVisible('text=No codes in Trash match'));
  await page.fill('#search-qrcodes', '');
  await page.waitForTimeout(300);
  check('no selection bar until something is selected', (await page.locator('#selection-bar').count()) === 0);
  await page.click(`#select-trashed-${c1.id}`);
  await page.waitForSelector('#selection-bar');
  check('the bar offers Restore and Delete forever, no Done', await page.isVisible('#restore-selected-btn') && await page.isVisible('#purge-selected-btn') && (await page.locator('#done-selecting-btn').count()) === 0);
  check('1 selected', (await barCount()) === '1');
  check('Select all 5 offered', (await page.textContent('#select-all-btn')).includes('Select all 5'));
  await page.focus(`#select-trashed-${c2.id}`);
  await page.keyboard.press('Space');
  check('Space toggles a focused checkbox', (await barCount()) === '2');
  await page.click(`[data-trashed-code="${c3.id}"] h3`);
  check('clicking the card itself selects it', (await barCount()) === '3');
  await shot('02-trash-selected');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape clears the selection and stays in Trash', (await page.locator('#selection-bar').count()) === 0 && (await trashCards()) === 5);

  console.log('Restore one');
  await page.click(`#restore-${c1.id}`);
  await page.waitForSelector('#trash-notice');
  check('notice: Restored 1 QR code.', (await page.textContent('#trash-notice')).includes('Restored 1 QR code.'));
  await page.waitForTimeout(500);
  check('card left Trash (4) and pill says 4', (await trashCards()) === 4 && (await pillCount()) === '4');
  check('database: restored and live', sql(`SELECT deleted_at IS NULL FROM qrcodes WHERE id=${c1.id}`) === '1');
  check('its link redirects again', (await scan(c1.shortId)).headers.get('location')?.startsWith('https://'));

  console.log('Restore several (selection)');
  await page.click(`#select-trashed-${c2.id}`);
  await page.click(`#select-trashed-${c3.id}`);
  await page.click('#restore-selected-btn');
  await page.waitForSelector('text=Restored 2 QR codes.');
  await page.waitForTimeout(500);
  check('2 more restored, 2 left in Trash', (await trashCards()) === 2 && inTrash(U) === 2, { cards: await trashCards(), db: inTrash(U) });
  await page.click('button:has-text("All Codes")');
  await page.waitForTimeout(500);
  const liveCards = await page.locator('[id^="edit-qr-"]').count();
  check('All Codes shows the restored codes (3 + 3 = 6... plus Code 7-9)', liveCards === 6, liveCards);
  check('stats card follows (6 of 50)', (await page.textContent('body')).includes('6 of 50 codes used'));
  check('scan history survived the round trip', sql(`SELECT COUNT(*) FROM scan_events WHERE qrcode_id=${c2.id}`) === '3');

  console.log('Delete forever (typed confirmation)');
  await page.click('#trash-pill');
  await page.waitForSelector('[data-trashed-code]');
  await page.click(`#purge-${c4.id}`);
  await page.waitForSelector('#confirm-action-title');
  check('title for one code', (await page.textContent('#confirm-action-title')) === 'Delete this QR code forever?');
  check('lists the code', (await page.textContent('#purge-confirm-list')).includes('Code 4'));
  check('says it cannot be undone', (await page.textContent('.modal-card')).includes('This can’t be undone.'));
  check('singular wording agrees (its scan history / Its link)', /along with its scan history\. Its link will stop working permanently\./.test(await page.textContent('.modal-card')), await page.textContent('.modal-card'));
  const confirmBtn = page.locator('.modal-card button[type="submit"]');
  check('confirm is disabled until delete is typed', await confirmBtn.isDisabled());
  await page.fill('#confirm-action-text', 'del');
  check('still disabled for a partial word', await confirmBtn.isDisabled());
  await page.fill('#confirm-action-text', 'nope');
  check('and for the wrong word', await confirmBtn.isDisabled());
  await shot('03-purge-dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape closes it without deleting', (await page.locator('#confirm-action-title').count()) === 0 && exists(c4.id));
  await page.click(`#purge-${c4.id}`);
  await page.fill('#confirm-action-text', 'DELETE');
  check('typing DELETE (any case) enables it', !(await confirmBtn.isDisabled()));
  await confirmBtn.click();
  await page.waitForSelector('text=Deleted 1 QR code forever.');
  await page.waitForTimeout(400);
  check('the code is permanently gone', !exists(c4.id));
  check('and its short link is dead for good', /not-found/.test((await scan(c4.shortId)).headers.get('location') || ''));
  check('pill and list follow (1 left)', (await pillCount()) === '1' && (await trashCards()) === 1);

  console.log('Empty Trash');
  // put 3 more in Trash from the dashboard first, to check "all" really empties everything
  await api(U, 'POST', '/api/qrcodes/bulk/trash', { ids: [byTitle['Code 7'].id, byTitle['Code 8'].id] });
  await scan(c5.shortId).catch(() => {});
  await page.reload();
  await page.waitForSelector('#trash-pill');
  await page.click('#trash-pill');
  await page.waitForSelector('[data-trashed-code]');
  check('3 codes in Trash after the reload', (await trashCards()) === 3, await trashCards());
  const liveBefore = live(U);
  await page.click('#empty-trash-btn');
  await page.waitForSelector('#confirm-action-title');
  check('titled Empty Trash?', (await page.textContent('#confirm-action-title')) === 'Empty Trash?');
  check('names the count', (await page.textContent('.modal-card')).includes('All 3 codes in Trash'));
  check('button names the count', (await confirmBtn.textContent()).includes('Delete 3 forever'));
  await page.fill('#confirm-action-text', 'delete');
  await confirmBtn.click();
  await page.waitForSelector('#trash-empty');
  check('Trash is empty in the database', inTrash(U) === 0);
  check('live codes untouched', live(U) === liveBefore, { before: liveBefore, after: live(U) });
  check('empty state shown', await page.isVisible('text=Trash is empty'));
  check('Empty Trash disabled when nothing is in it', await page.isDisabled('#empty-trash-btn'));
  check('pill says 0', (await pillCount()) === '0');
  await shot('04-trash-empty');

  console.log('Moving between views');
  await page.click('button:has-text("All Codes")');
  await page.waitForTimeout(300);
  await page.click('#select-mode-btn');
  await page.click(`#select-qr-${c1.id}`);
  check('selecting in a normal view', (await barCount()) === '1');
  await page.click('#trash-pill');
  await page.waitForSelector('#trash-empty');
  check('going to Trash leaves select mode and clears the selection', (await page.locator('#selection-bar').count()) === 0);
  await page.click('button:has-text("All Codes")');
  await page.waitForTimeout(300);
  check('and select mode is off when coming back', (await page.locator('input[id^="select-qr-"]').count()) === 0);
  // the undo toast is not shown while looking at Trash
  await page.click('#select-mode-btn');
  await page.click(`#select-qr-${c1.id}`);
  await page.click('#trash-selected-btn');
  await page.click('.modal-card button:has-text("Move to Trash")');
  await page.waitForSelector('#undo-toast');
  check('toast shows after moving a code to Trash', true);
  check('the pill went up by one', (await pillCount()) === '1', await pillCount());
  await page.click('#trash-pill');
  await page.waitForSelector('[data-trashed-code]');
  check('the undo toast is hidden while in Trash', (await page.locator('#undo-toast').count()) === 0);
  check('the code shows up in Trash', (await trashCards()) === 1);

  console.log('Restore refused at the package limit (Starter, limit 5)');
  {
    const S = await register(`tv-s-${stamp}@example.com`, { pkg: 'starter' });
    const mk = (await api(S, 'POST', '/api/qrcodes/bulk', { rows: rows(5, 'S') })).json.qrcodes;
    await api(S, 'POST', '/api/qrcodes/bulk/trash', { ids: mk.slice(0, 4).map((q) => q.id) });
    await api(S, 'POST', '/api/qrcodes/bulk', { rows: rows(4, 'Fill') });  // now 5 live: 1 + 4
    await api(S, 'POST', '/api/qrcodes/bulk/trash', { ids: [mk[4].id] });  // 4 live, 5 trashed
    const b2 = await launchBrowser();
    const c2 = await b2.newContext({ viewport: { width: 1280, height: 900 } });
    await c2.addCookies([cookieFor(S)]);
    const p2 = await c2.newPage();
    await p2.goto(`${config.baseUrl}/dashboard`);
    await p2.click('#trash-pill');
    await p2.waitForSelector('[data-trashed-code]');
    for (const q of mk.slice(0, 3)) await p2.click(`#select-trashed-${q.id}`);
    await p2.click('#restore-selected-btn');
    await p2.waitForSelector('#trash-notice');
    const msg = await p2.textContent('#trash-notice');
    check('red notice says how many fit', /room for 1 more code, but 3 were selected/.test(msg), msg);
    check('the notice is an alert (error styling)', (await p2.getAttribute('#trash-notice', 'role')) === 'alert');
    check('nothing was restored', live(S) === 4 && inTrash(S) === 5, { live: live(S), trash: inTrash(S) });
    await p2.screenshot({ path: path.join(OUT, '05-restore-refused.png') });
    await b2.close();
  }

  console.log('Phone layout');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await page.waitForSelector('#trash-pill');
  await page.click('#trash-pill');
  await page.waitForSelector('[data-trashed-code]');
  await page.click(`#select-trashed-${c1.id}`);
  await shot('06-trash-mobile');
  check('no horizontal scroll in Trash on a phone', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  const bar = await page.locator('#selection-bar').boundingBox();
  check('selection bar fits the screen', bar.x >= 0 && bar.x + bar.width <= 391, bar);

  check('no native browser dialogs were used', nativeDialog === null, nativeDialog);
  const unexpected = consoleErrors.filter((m) => !/status of 403/.test(m));
  check('no console errors (apart from the deliberate 403)', unexpected.length === 0, unexpected);
  await browser.close();
  finish();
});
