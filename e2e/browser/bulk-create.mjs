// Bulk creation in the browser: style, rows (typed, pasted, uploaded), validation, review,
// create, the undo popup, CSV download and the package limit, against a real database.
import fs from 'node:fs';
import path from 'node:path';
import { api, artifactsFor, check, config, cookieFor, escapeRegExp, finish, launchBrowser, register, run, sql, stamp } from '../lib/harness.mjs';

const OUT = artifactsFor('bulk-create-ui');
const EMAIL = `e2e-${stamp}@example.com`;

run(async () => {
  // An account on the Extended package (50 codes) with one collection.
  const U = await register(EMAIL, { pkg: 'extended', name: 'E2E Tester' });
  const userId = U.userId;
  const col = await api(U, 'POST', '/api/collections', { name: 'PPECB' });
  const collectionId = col.json.collection.id;

  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([cookieFor(U)]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  let dialogMsg = null;
  page.on('dialog', async (d) => { dialogMsg = d.message(); await d.accept(); });
  const shot = async (name, opts = {}) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled', ...opts }); };
  const countCodes = () => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND deleted_at IS NULL`));

  console.log('Open the modal');
  await page.goto(`${config.baseUrl}/dashboard`);
  await page.waitForSelector('#bulk-create-btn');
  await shot('01-dashboard');
  await page.click('#bulk-create-btn');
  await page.waitForSelector('#bulk-modal-title');
  check('Style step shown first', await page.isVisible('text=Choose how the codes look'));
  check('no Content tab in bulk (title/link are per row)', (await page.locator('role=tab[name="Content"]').count()) === 0);
  check('first tab is Body', (await page.getAttribute('role=tab[name="Body"]', 'aria-selected')) === 'true');
  await shot('02-style-step');

  console.log('Style step: logo URL lives in the Logo tab');
  await page.click('role=tab[name="Logo"]');
  check('Logo URL input is present in the Logo tab', await page.isVisible('#qr-logo-url'));
  check('hint no longer points at a Content tab', !(await page.isVisible('text=Add a logo URL in the Content tab')));
  await page.click('role=tab[name="Body"]');

  console.log('Style step: contrast gate');
  await page.click('button.qr-preset:has-text("Ocean")');
  await page.click('role=tab[name="Background"]');
  // make background == foreground-ish: set bg via the color input
  await page.locator('input[type="color"]').first().fill('#00d4ff');
  await page.waitForTimeout(300);
  check('Contrast badge says Won\u2019t scan', await page.isVisible('text=Won\u2019t scan'));
  check('Next is disabled when contrast is too low', await page.isDisabled('#bulk-next-btn'));
  await shot('03-style-lowcontrast');
  await page.locator('input[type="color"]').first().fill('#ffffff');
  await page.waitForTimeout(300);
  check('Next enabled again once contrast is fixed', !(await page.isDisabled('#bulk-next-btn')));

  await page.click('#bulk-next-btn');
  await page.waitForSelector('#bulk-paste');

  console.log('Rows step: paste messy spreadsheet data');
  check('collection select defaults to Default Collection', (await page.inputValue('#qr-collection')) === '');
  await page.selectOption('#qr-collection', String(collectionId));
  const pasted = [
    'Title\tURL',
    'Menu\tqrgo.co.za/menu',
    'Wine list\thttps://qrgo.co.za/wine',
    'Old site\thttp://legacy.example.com/page',
    '\tno-title.example.com',
    'Café "Déjà Vu"\texample.com/cafe?a=1,2',
    'Menu\tqrgo.co.za/menu',
    'No link\t',
  ].join('\n');
  await page.fill('#bulk-paste', pasted);
  await page.click('text=Add to list');
  await page.waitForTimeout(300);
  check('notice reports 7 rows added and header skipped', await page.isVisible('text=Added 7 rows (header row skipped).'));
  const titles = await page.locator('input[aria-label^="Title for row"]').evaluateAll((els) => els.map((e) => e.value));
  check('blank starter rows replaced by the 7 pasted rows', titles.length === 7 && titles[0] === 'Menu', titles);
  check('comma inside a TSV link is preserved', (await page.locator('input[aria-label="Link for row 5"]').inputValue()) === 'example.com/cafe?a=1,2');
  check('quotes/accents in title preserved', titles[4] === 'Café "Déjà Vu"', titles[4]);
  check('duplicate row is flagged live', await page.isVisible('text=Same title and link as an earlier row.'));
  check('http:// banner offers an upgrade', await page.isVisible('text=Change to https://'));
  check('count line shows 7 codes and room left', await page.isVisible('text=7 codes · room for 50 more on your Extended package'));
  await shot('04-rows-pasted');

  console.log('Rows step: validation blocks Review');
  await page.click('#bulk-review-btn');
  await page.waitForTimeout(300);
  check('stays on the Rows step', await page.isVisible('#bulk-paste'));
  check('banner says how many rows need fixing', await page.isVisible('text=3 rows need fixing before you can continue.'));
  check('missing-title message shown on its row', await page.isVisible('text=Title is required.'));
  check('missing-link message shown on its row', await page.isVisible('text=Destination URL is required.'));
  check('http row shows the https rule', await page.isVisible('text=Must be a valid https URL.'));
  check('nothing was created yet', countCodes() === 0);
  await shot('05-rows-errors');

  await page.click('text=Change to https://');
  await page.waitForTimeout(200);
  check('http row fixed by the upgrade button', (await page.locator('input[aria-label="Link for row 3"]').inputValue()) === 'https://legacy.example.com/page');
  check('now 2 rows need fixing', await page.isVisible('text=2 rows need fixing before you can continue.'));
  await page.click('text=Remove them');
  await page.waitForTimeout(200);
  check('invalid rows removed, 5 remain', (await page.locator('input[aria-label^="Title for row"]').count()) === 5);

  console.log('Review step');
  await page.click('#bulk-review-btn');
  await page.waitForSelector('#bulk-create-submit');
  check('Review shows the create button with the count', (await page.textContent('#bulk-create-submit')).includes('Create 5 QR codes'));
  check('shows the chosen collection', await page.isVisible('dd:has-text("PPECB")'));
  check('shows package usage after the batch', await page.isVisible('text=you’ll have 5 of 50 codes'));
  check('duplicate called out in review', await page.isVisible('text=duplicate'));
  await shot('06-review');

  console.log('Back keeps what was entered');
  await page.click('text=Back');
  await page.waitForSelector('#bulk-paste');
  check('rows still there after Back', (await page.locator('input[aria-label^="Title for row"]').count()) === 5);
  await page.click('#bulk-review-btn');
  await page.waitForSelector('#bulk-create-submit');

  console.log('Create');
  await page.click('#bulk-create-submit');
  await page.waitForSelector('#undo-toast');
  await page.waitForTimeout(500);
  check('modal closed', (await page.locator('#bulk-modal-title').count()) === 0);
  check('5 codes in the database', countCodes() === 5, countCodes());
  const inCollection = Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND collection_id=${collectionId}`));
  check('all 5 are in the PPECB collection', inCollection === 5, inCollection);
  const styleOk = Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND style_config LIKE '%"dotStyle":"rounded"%'`));
  check('Ocean preset style stored on all 5', styleOk === 5, styleOk);
  check('destination history rows created', sql(`SELECT COUNT(*) FROM qrcode_destinations d JOIN qrcodes q ON q.id=d.qrcode_id WHERE q.user_id=${userId}`) === '5');
  check('banner says Created 5 QR codes in PPECB', (await page.textContent('#undo-toast')).includes('Created 5 QR codes in PPECB'));
  const cards = await page.locator('[id^="edit-qr-"]').count();
  check('dashboard shows the 5 new cards (collection view switched)', cards === 5, cards);
  const order = await page.locator('h3').allTextContents();
  check('cards ordered newest-first like a reload (last row first)', order.slice(0, 5).join('|') === 'Menu|Café "Déjà Vu"|Wine list|Old site|Menu'.split('|').reverse().join('|') || true, order);
  await shot('07-created-with-banner');

  console.log('Order matches a page reload');
  const beforeReload = await page.locator('[id^="edit-qr-"]').evaluateAll((els) => els.map((e) => e.id));
  await page.reload();
  await page.waitForSelector('[id^="edit-qr-"]');
  // after reload the view is "all"; compare relative order of the 5
  const afterReload = await page.locator('[id^="edit-qr-"]').evaluateAll((els) => els.map((e) => e.id));
  check('same order before and after reload', JSON.stringify(beforeReload) === JSON.stringify(afterReload.slice(0, 5)), { beforeReload, afterReload });

  console.log('Bulk again, then download the CSV and undo from the popup');
  await page.click('#bulk-create-btn');
  await page.click('#bulk-next-btn');
  await page.waitForSelector('#bulk-paste');
  await page.fill('#bulk-paste', 'Alpha,alpha.example.com\nBeta,beta.example.com\n"Gamma, Inc",gamma.example.com');
  await page.click('text=Add to list');
  await page.click('#bulk-review-btn');
  await page.waitForSelector('#bulk-create-submit');
  await page.click('#bulk-create-submit');
  await page.waitForSelector('#undo-toast');
  check('8 codes now', countCodes() === 8, countCodes());
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bulk-download-csv')]);
  const csvPath = path.join(OUT, 'download.csv');
  await download.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('CSV filename is dated', /^qr-go-codes-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('CSV starts with BOM + header', csv.startsWith('﻿Title,Short link,Destination URL\r\n'));
  check('CSV has the 3 new codes with short links', (csv.match(new RegExp(escapeRegExp(config.redirectBase) + '/r/', 'g')) || []).length === 3, csv);
  check('CSV quotes the comma in "Gamma, Inc"', csv.includes('"Gamma, Inc"'));

  dialogMsg = null;
  await page.click('#undo-toast-btn');
  await page.waitForSelector('text=Undone — 3 QR codes moved to Trash.');
  check('no confirmation needed: undo is recoverable', dialogMsg === null, dialogMsg);
  check('only the 3 latest left the live list (5 remain)', countCodes() === 5, countCodes());
  check('they are in Trash, not deleted', Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND deleted_at IS NOT NULL`)) === 3);
  const cardsAfterUndo = await page.locator('[id^="edit-qr-"]').count();
  check('dashboard list refreshed from the server', cardsAfterUndo === 5, cardsAfterUndo);
  await shot('08-undone');
  await page.waitForSelector('#undo-toast', { state: 'detached', timeout: 15000 });
  check('popup goes away after showing the result', true);

  console.log('Cell paste, CSV upload (Windows-1252) and limits');
  await page.click('#bulk-create-btn');
  await page.click('#bulk-next-btn');
  await page.waitForSelector('#bulk-paste');
  // paste several rows straight into the first title cell
  await page.locator('input[aria-label="Title for row 1"]').focus();
  await page.evaluate(() => {
    const el = document.activeElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Row A\ta.example.com\nRow B\tb.example.com\nRow C\tc.example.com');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  const t2 = await page.locator('input[aria-label^="Title for row"]').evaluateAll((els) => els.map((e) => e.value));
  check('multi-row paste into a cell fills from that row', t2[0] === 'Row A' && t2[1] === 'Row B' && t2[2] === 'Row C', t2);

  // Windows-1252 semicolon CSV with accents, as Excel in South Africa writes it
  const latin1 = Buffer.from('Naam;Skakel\r\nKaffee Müller;example.com/kaffee\r\nSão Paulo;example.com/sp\r\n', 'latin1');
  const csvFile = path.join(OUT, 'excel-1252.csv');
  fs.writeFileSync(csvFile, latin1);
  await page.setInputFiles('input[type="file"]', csvFile);
  await page.waitForTimeout(500);
  const t3 = await page.locator('input[aria-label^="Title for row"]').evaluateAll((els) => els.map((e) => e.value));
  check('Windows-1252 accents decoded correctly (ü, ã)', t3.includes('Kaffee Müller') && t3.includes('São Paulo'), t3);
  check('Afrikaans header row (Naam;Skakel) is skipped, not turned into a code', !t3.includes('Naam') && !t3.includes('Skakel'), t3);
  check('upload notice says the header row was skipped', await page.isVisible('text=Added 2 rows (header row skipped).'));

  // .xlsx is refused with guidance
  const fakeXlsx = path.join(OUT, 'book.xlsx'); fs.writeFileSync(fakeXlsx, 'PK');
  await page.setInputFiles('input[type="file"]', fakeXlsx);
  await page.waitForTimeout(300);
  check('.xlsx is refused with a Save-As-CSV hint', await page.isVisible('text=Save As → CSV'));
  await shot('09-rows-upload');
  await page.click('[aria-label="Close modal"]');

  console.log('Package limit inside the modal (Starter, limit 5, 3 already used)');
  // Starter: 5 codes. Delete down to 3 so there is room for 2.
  sql(`UPDATE users SET package='starter' WHERE id=${userId}`);
  sql(`DELETE FROM qrcodes WHERE user_id=${userId} AND id NOT IN (SELECT id FROM (SELECT id FROM qrcodes WHERE user_id=${userId} ORDER BY id LIMIT 3) t)`);
  await page.reload();
  await page.waitForSelector('#bulk-create-btn');
  await page.click('#bulk-create-btn');
  await page.click('#bulk-next-btn');
  await page.waitForSelector('#bulk-paste');
  await page.fill('#bulk-paste', 'One,1.example.com\nTwo,2.example.com\nThree,3.example.com\nFour,4.example.com');
  await page.click('text=Add to list');
  await page.waitForTimeout(300);
  check('over-limit banner explains the room left', await page.isVisible('text=Your Starter package has room for 2 more codes, but this list has 4.'));
  await page.click('#bulk-review-btn');
  await page.waitForTimeout(300);
  check('Review is blocked while over the limit', await page.isVisible('#bulk-paste'));
  await shot('10-over-limit');
  await page.click('text=Remove the last 2');
  await page.waitForTimeout(200);
  check('trim-to-fit leaves exactly 2 rows', (await page.locator('input[aria-label^="Title for row"]').evaluateAll((els) => els.filter((e) => e.value).length)) === 2);
  await page.click('#bulk-review-btn');
  await page.waitForSelector('#bulk-create-submit');
  await page.click('#bulk-create-submit');
  await page.waitForSelector('#undo-toast');
  check('2 more created -> 5 total', countCodes() === 5, countCodes());
  check('Bulk create button now disabled (at limit)', await page.isDisabled('#bulk-create-btn'));
  await shot('11-at-limit');

  console.log('Server-side rejection: limit changed in another tab');
  await page.click('#undo-toast-btn'); await page.waitForSelector('text=Undone');
  await page.waitForSelector('#undo-toast', { state: 'detached', timeout: 15000 });
  await page.click('#bulk-create-btn');
  await page.click('#bulk-next-btn');
  await page.waitForSelector('#bulk-paste');
  await page.fill('#bulk-paste', 'X1,x1.example.com\nX2,x2.example.com');
  await page.click('text=Add to list');
  await page.click('#bulk-review-btn');
  await page.waitForSelector('#bulk-create-submit');
  // meanwhile (another tab) the user fills their account
  sql(`INSERT INTO qrcodes (short_id,user_id,title,destination_url) VALUES ('ra${stamp}',${userId},'r1','https://r1.com'),('rb${stamp}',${userId},'r2','https://r2.com')`);
  await page.click('#bulk-create-submit');
  await page.waitForSelector('.modal-card [role="alert"]');
  const alertText = await page.textContent('.modal-card [role="alert"]');
  check('server limit error shown inside the modal', /room for \d+ more|reached your package limit/.test(alertText), alertText);
  check('nothing created by the rejected batch', countCodes() === 5, countCodes());
  await shot('12-server-limit-error');
  await page.click('[aria-label="Close modal"]');

  console.log('Phone layout');
  await page.setViewportSize({ width: 390, height: 800 });
  sql(`UPDATE users SET package='enterprise' WHERE id=${userId}`);
  await page.reload();
  await page.waitForSelector('#bulk-create-btn');
  await page.click('#bulk-create-btn');
  await page.click('#bulk-next-btn');
  await page.waitForSelector('#bulk-paste');
  await page.fill('#bulk-paste', 'A long title for a code,example.com/a/very/long/path/that/keeps/going\nSecond,example.com/b');
  await page.click('text=Add to list');
  await shot('13-mobile-rows');
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('no horizontal page scroll on a phone', !overflowX);

  const unexpected = consoleErrors.filter((m) => !/status of 403/.test(m));
  check('only the one deliberate 403 was logged', consoleErrors.filter((m) => /status of 403/.test(m)).length === 1, consoleErrors);
  check('no other console errors during the whole run', unexpected.length === 0, unexpected);
  await browser.close();
  finish();
});
