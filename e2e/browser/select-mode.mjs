// Select mode: checkboxes, shift-click ranges, select-all-in-view, selection following the
// filters, the confirm dialog, move to Trash, the undo popup, Escape with stacked dialogs.
import path from 'node:path';
import { api, artifactsFor, check, config, cookieFor, finish, launchBrowser, register, run, sql, stamp } from '../lib/harness.mjs';

const OUT = artifactsFor('select-mode');
const live = (u) => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${u.userId} AND deleted_at IS NULL`));
const inTrash = (u) => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${u.userId} AND deleted_at IS NOT NULL`));
const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ title: `${tag} ${i + 1}`, destinationUrl: `${tag.toLowerCase()}${i + 1}.example.com` }));

run(async () => {
  const U = await register(`sel-${stamp}@example.com`, { pkg: 'extended' });
  const colA = (await api(U, 'POST', '/api/collections', { name: `Alpha ${stamp}` })).json.collection;
  const inA = (await api(U, 'POST', '/api/qrcodes/bulk', { rows: rows(6, 'Alpha'), collectionId: colA.id })).json.qrcodes;
  const inDefault = (await api(U, 'POST', '/api/qrcodes/bulk', { rows: rows(6, 'Beta') })).json.qrcodes;
  const all = [...inA, ...inDefault];

  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([cookieFor(U)]);
  const page = await ctx.newPage();
  await page.clock.install();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  let nativeDialog = null;
  page.on('dialog', async (d) => { nativeDialog = d.message(); await d.dismiss(); });
  const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' }); };
  const cards = () => page.locator('[id^="edit-qr-"]').count();
  const selectedText = async () => (await page.textContent('#selection-bar strong'));

  await page.goto(`${config.baseUrl}/dashboard`);
  await page.waitForSelector('#select-mode-btn');
  await page.waitForTimeout(500);

  console.log('Entering select mode');
  check('12 cards shown', (await cards()) === 12, await cards());
  check('no checkboxes outside select mode', (await page.locator('input[id^="select-qr-"]').count()) === 0);
  check('no selection bar outside select mode', (await page.locator('#selection-bar').count()) === 0);
  await page.click('#select-mode-btn');
  await page.waitForSelector('#selection-bar');
  check('a checkbox on every card', (await page.locator('input[id^="select-qr-"]').count()) === 12);
  check('0 selected, Move to Trash disabled', (await selectedText()) === '0' && (await page.isDisabled('#trash-selected-btn')));
  check('"Select all 12" offered', await page.isVisible('#select-all-btn') && (await page.textContent('#select-all-btn')).includes('Select all 12'));
  check('button now reads Cancel selection', (await page.textContent('#select-mode-btn')).includes('Cancel selection'));
  await shot('01-select-mode');

  console.log('Selecting');
  await page.click(`#select-qr-${all[0].id}`);
  check('1 selected after ticking a box', (await selectedText()) === '1');
  check('the card is marked selected', (await page.getAttribute(`#select-qr-${all[0].id} >> xpath=..`, 'data-selected')) === 'true');
  // clicking the code image toggles instead of opening the editor
  await page.click(`#edit-qr-${all[1].id}`);
  check('clicking the code image selects it (no editor opens)', (await selectedText()) === '2' && (await page.locator('#qr-title').count()) === 0);
  await page.click(`#edit-qr-${all[1].id}`);
  check('clicking again deselects', (await selectedText()) === '1');
  // clicking blank card area toggles
  const card2 = page.locator(`#select-qr-${all[2].id} >> xpath=..`);
  await card2.click({ position: { x: 10, y: 10 } });
  check('clicking the card background selects it', (await selectedText()) === '2');
  // keyboard
  await page.focus(`#select-qr-${all[3].id}`);
  await page.keyboard.press('Space');
  check('Space on a focused checkbox toggles it', (await selectedText()) === '3');
  await page.click('#clear-selection-btn');
  check('Clear empties the selection', (await selectedText()) === '0');

  console.log('Shift-click range (cards are newest first)');
  const order = await page.locator('input[id^="select-qr-"]').evaluateAll((els) => els.map((e) => Number(e.id.replace('select-qr-', ''))));
  await page.click(`#select-qr-${order[2]}`);
  await page.click(`#select-qr-${order[5]}`, { modifiers: ['Shift'] });
  check('shift-click selects the whole range (4 cards)', (await selectedText()) === '4', await selectedText());
  await page.click('#clear-selection-btn');

  console.log('Selection follows the view (hidden codes are never acted on)');
  await page.click(`#select-qr-${order[0]}`);
  await page.click(`#select-qr-${order[1]}`);
  await page.click(`#select-qr-${order[2]}`);
  check('3 selected', (await selectedText()) === '3');
  const firstTitle = (await page.locator('h3').allTextContents())[0];
  await page.fill('#search-qrcodes', firstTitle);
  await page.waitForTimeout(300);
  check('searching for one code: only visible selections count (1)', (await selectedText()) === '1', await selectedText());
  await page.fill('#search-qrcodes', '');
  await page.waitForTimeout(300);
  check('clearing the search brings them back (3)', (await selectedText()) === '3');
  await page.click('#clear-selection-btn');

  console.log('Select all respects the collection filter');
  await page.click(`button:has-text("Alpha ${stamp}")`);
  await page.waitForTimeout(300);
  check('collection view shows 6 cards', (await cards()) === 6);
  await page.click('#select-all-btn');
  check('"Select all" selects the 6 in view only', (await selectedText()) === '6');
  check('and the offer disappears once everything in view is selected', (await page.locator('#select-all-btn').count()) === 0);
  await page.click('button:has-text("All Codes")');
  await page.waitForTimeout(300);
  check('back to All Codes: still 6 selected (the 6 hidden ones are not)', (await selectedText()) === '6', await selectedText());
  await page.click('#clear-selection-btn');
  await page.click('#select-all-btn');
  check('Select all 12 in the full view', (await selectedText()) === '12');

  console.log('Escape leaves select mode');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('selection bar and checkboxes gone', (await page.locator('#selection-bar').count()) === 0 && (await page.locator('input[id^="select-qr-"]').count()) === 0);

  console.log('Confirm dialog');
  await page.click('#select-mode-btn');
  const three = [order[0], order[1], order[2]];
  for (const id of three) await page.click(`#select-qr-${id}`);
  await page.click('#trash-selected-btn');
  await page.waitForSelector('#confirm-action-title');
  check('titled with the count', (await page.textContent('#confirm-action-title')) === 'Move 3 QR codes to Trash?');
  check('lists the three titles', (await page.locator('#trash-confirm-list li').count()) === 3);
  const body = await page.textContent('.modal-card');
  check('says they stop working at once and how long they can be restored', /stop working straight away/.test(body) && /for 30 days/.test(body), body);
  check('confirm button names the count', await page.isVisible('button:has-text("Move 3 to Trash")'));
  await shot('02-confirm');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape closes only the dialog', (await page.locator('#confirm-action-title').count()) === 0 && (await page.locator('#selection-bar').count()) === 1);
  check('and keeps the selection', (await selectedText()) === '3');
  check('nothing was moved', live(U) === 12 && inTrash(U) === 0);

  console.log('Move to Trash');
  await page.click('#trash-selected-btn');
  await page.waitForSelector('#confirm-action-title');
  await page.click('.modal-card button:has-text("Cancel")');
  await page.waitForTimeout(200);
  check('Cancel also changes nothing', live(U) === 12);
  await page.click('#trash-selected-btn');
  await page.click('.modal-card button:has-text("Move 3 to Trash")');
  await page.waitForSelector('#undo-toast');
  await page.waitForTimeout(400);
  check('3 codes now in Trash in the database', inTrash(U) === 3 && live(U) === 9, { trash: inTrash(U), live: live(U) });
  check('9 cards remain', (await cards()) === 9);
  check('select mode ended', (await page.locator('#selection-bar').count()) === 0);
  check('stats card shows 9 codes', (await page.textContent('body')).includes('9 of 50 codes used'));
  const toastText = await page.textContent('#undo-toast');
  check('toast says Moved 3 QR codes to Trash', toastText.includes('Moved 3 QR codes to Trash'), toastText);
  const gone = all.find((c) => c.id === three[0]) || all[0];
  const rd = await fetch(`${config.baseUrl}/r/${(await api(U, 'GET', '/api/qrcodes/trash')).json.qrcodes[0].shortId}`, { redirect: 'manual' });
  check('a trashed code\'s link now goes to the not-found page', /code-unavailable\?reason=not-found/.test(rd.headers.get('location') || ''), rd.headers.get('location'));
  void gone;
  await shot('03-moved-toast');

  console.log('Undo from the toast restores them');
  await page.click('#undo-toast-btn');
  await page.waitForSelector('text=Restored 3 QR codes.');
  await page.waitForTimeout(400);
  check('back to 12 live codes, none in Trash', live(U) === 12 && inTrash(U) === 0);
  check('12 cards on the dashboard again', (await cards()) === 12, await cards());
  check('the same short links work again', (await fetch(`${config.baseUrl}/r/${all[0].shortId}`, { redirect: 'manual' })).headers.get('location')?.startsWith('https://'));

  console.log('Escape with dialogs stacked on the edit screen');
  {
    const probe = order[6];
    await page.click(`#edit-qr-${probe}`);
    await page.waitForSelector('#qr-title');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape still closes the edit screen when nothing is on top of it', (await page.locator('#qr-title').count()) === 0);
    await page.click('#create-qr-btn');
    await page.waitForSelector('#qr-title');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('and the create screen', (await page.locator('#qr-title').count()) === 0);

    await page.click(`#edit-qr-${probe}`);
    await page.waitForSelector('#qr-title');
    await page.fill('#qr-title', 'An edit I have not saved');
    await page.click('#delete-qr-btn');
    await page.waitForSelector('#confirm-action-title');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape in the confirmation closes only the confirmation', (await page.locator('#confirm-action-title').count()) === 0);
    check('the edit screen stays open', (await page.locator('#qr-title').count()) === 1);
    check('with the unsaved edit intact', (await page.inputValue('#qr-title')) === 'An edit I have not saved');
    check('nothing was moved to Trash', inTrash(U) === 0, inTrash(U));
    await page.click('#delete-qr-btn');
    await page.waitForSelector('#confirm-action-title');
    await page.click('.modal-card >> nth=-1 >> button:has-text("Cancel")');
    await page.waitForTimeout(250);
    check('Cancel in the confirmation also keeps the edit screen and its edit', (await page.locator('#qr-title').count()) === 1 && (await page.inputValue('#qr-title')) === 'An edit I have not saved');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('a second Escape then closes the edit screen', (await page.locator('#qr-title').count()) === 0);
  }

  console.log('Delete from the edit screen now moves to Trash');
  await page.click('#undo-toast >> text=✕').catch(() => {});
  await page.waitForTimeout(300);
  const victim = order[4];
  await page.click(`#edit-qr-${victim}`);
  await page.waitForSelector('#delete-qr-btn');
  check('the button says Move to Trash', (await page.textContent('#delete-qr-btn')).includes('Move to Trash'));
  await page.click('#delete-qr-btn');
  await page.waitForSelector('#confirm-action-title');
  check('single-code confirm wording', (await page.textContent('#confirm-action-title')) === 'Move this QR code to Trash?');
  check('no native browser confirm was used', nativeDialog === null, nativeDialog);
  await page.click('.modal-card >> nth=-1 >> button:has-text("Move to Trash")');
  await page.waitForSelector('#undo-toast');
  await page.waitForTimeout(400);
  check('edit screen closed', (await page.locator('#qr-title').count()) === 0);
  check('that one code is in Trash', inTrash(U) === 1 && live(U) === 11);
  check('toast names the code', (await page.textContent('#undo-toast')).includes('Moved “'), await page.textContent('#undo-toast'));

  console.log('Toast goes away by itself after 30 seconds');
  await page.clock.fastForward('00:25');
  check('still there at 25 s', (await page.locator('#undo-toast').count()) === 1);
  await page.clock.fastForward('00:10');
  await page.waitForTimeout(200);
  check('gone by 35 s', (await page.locator('#undo-toast').count()) === 0);
  await api(U, 'POST', '/api/qrcodes/bulk/restore', { ids: [victim] });

  check('no native confirm/alert dialogs were shown at any point', nativeDialog === null, nativeDialog);

  console.log('Phone layout');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await page.waitForSelector('#select-mode-btn');
  await page.click('#select-mode-btn');
  await page.waitForSelector('#selection-bar');
  await page.click('#select-all-btn');
  await shot('04-mobile-select');
  check('no horizontal scroll with the selection bar', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  const barBox = await page.locator('#selection-bar').boundingBox();
  check('selection bar fits within the screen', barBox.x >= 0 && barBox.x + barBox.width <= 391, barBox);
  await page.setViewportSize({ width: 1280, height: 900 });

  await browser.close();

  console.log('Restore refused at the package limit shows a clear message (Starter, limit 5)');
  {
    const S = await register(`sel-s-${stamp}@example.com`, { pkg: 'starter' });
    const made = (await api(S, 'POST', '/api/qrcodes/bulk', { rows: rows(5, 'S') })).json.qrcodes;
    const b2 = await launchBrowser();
    const c2 = await b2.newContext({ viewport: { width: 1280, height: 900 } });
    await c2.addCookies([cookieFor(S)]);
    const p2 = await c2.newPage();
    await p2.goto(`${config.baseUrl}/dashboard`);
    await p2.waitForSelector('#select-mode-btn');
    await p2.click('#select-mode-btn');
    await p2.click(`#select-qr-${made[0].id}`);
    await p2.click(`#select-qr-${made[1].id}`);
    await p2.click('#trash-selected-btn');
    await p2.click('.modal-card button:has-text("Move 2 to Trash")');
    await p2.waitForSelector('#undo-toast');
    // meanwhile the account fills up again from somewhere else
    await api(S, 'POST', '/api/qrcodes/bulk', { rows: rows(2, 'Filler') });
    await p2.click('#undo-toast-btn');
    await p2.waitForSelector('#undo-toast >> text=reached your package limit');
    check('the toast explains the limit message', true);
    check('Undo is still offered to retry', await p2.isVisible('#undo-toast-btn') && !(await p2.isDisabled('#undo-toast-btn')));
    check('nothing was restored', inTrash(S) === 2 && live(S) === 5, { trash: inTrash(S), live: live(S) });
    await p2.waitForTimeout(500);
    check('the dashboard caught up with the account (5 of 5 codes used)', (await p2.textContent('body')).includes('5 of 5 codes used'));
    await p2.screenshot({ path: path.join(OUT, '05-restore-refused.png') });
    await b2.close();
  }

  const unexpected = consoleErrors.filter((m) => !/status of 403/.test(m));
  check('no console errors (apart from the deliberate 403)', unexpected.length === 0, unexpected);
  finish();
});
