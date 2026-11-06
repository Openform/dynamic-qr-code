// Failure paths of bulk creation that a healthy server can't produce (a dropped
// connection, server rejections, a failing undo), via request interception and a fake clock.
import { api, check, config, cookieFor, finish, launchBrowser, register, run, sql, stamp } from '../lib/harness.mjs';

const EMAIL = `err-${stamp}@example.com`;

run(async () => {
  const U = await register(EMAIL, { pkg: 'business', name: 'Err Tester' });
  const userId = U.userId;
  const count = () => Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE user_id=${userId} AND deleted_at IS NULL`));

  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([cookieFor(U)]);
  const page = await ctx.newPage();
  await page.clock.install();
  const refreshes = [];
  page.on('request', (r) => { if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/qrcodes') refreshes.push(r.url()); });
  page.on('dialog', (d) => d.accept());

  await page.goto(`${config.baseUrl}/dashboard`);
  await page.waitForSelector('#bulk-create-btn');
  const initialGets = refreshes.length;

  async function openToReview(text) {
    await page.click('#bulk-create-btn');
    await page.click('#bulk-next-btn');
    await page.waitForSelector('#bulk-paste');
    await page.fill('#bulk-paste', text);
    await page.click('text=Add to list');
    await page.click('#bulk-review-btn');
    await page.waitForSelector('#bulk-create-submit');
  }

  console.log('Dropped connection while creating');
  await openToReview('A,a.example.com\nB,b.example.com');
  await page.route('**/api/qrcodes/bulk', (r) => r.abort());
  await page.click('#bulk-create-submit');
  await page.waitForSelector('text=We couldn’t confirm whether the codes were created');
  check('tells the user to check the dashboard before retrying', true);
  check('modal stays open', await page.isVisible('#bulk-create-submit'));
  check('Create button usable again (not stuck on "Creating…")', !(await page.isDisabled('#bulk-create-submit')));
  await page.waitForTimeout(300);
  check('dashboard reloaded its code list from the server', refreshes.length > initialGets, refreshes);
  check('nothing was created', count() === 0);

  console.log('Server rejects rows the browser accepted (400 with row errors)');
  await page.unroute('**/api/qrcodes/bulk');
  await page.route('**/api/qrcodes/bulk', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Some rows need fixing before the codes can be created.', errors: [{ row: 0, field: 'title', message: 'Title is required.' }] }) }));
  await page.click('#bulk-create-submit');
  await page.waitForSelector('#bulk-paste');
  check('sent back to the Rows step', true);
  check('server message shown', await page.isVisible('text=Some rows need fixing before the codes can be created.'));

  console.log('Throttled (429)');
  await page.unroute('**/api/qrcodes/bulk');
  await page.route('**/api/qrcodes/bulk', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'You’re creating codes too quickly. Please wait a little and try again.' }) }));
  await page.click('#bulk-review-btn');
  await page.waitForSelector('#bulk-create-submit');
  await page.click('#bulk-create-submit');
  await page.waitForSelector('text=creating codes too quickly');
  check('429 message shown on the Review step', await page.isVisible('#bulk-create-submit'));

  console.log('Escape closes the modal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('modal closed by Escape', (await page.locator('#bulk-modal-title').count()) === 0);

  console.log('Real create, then failing undos (undo = move the batch to Trash)');
  await page.unroute('**/api/qrcodes/bulk');
  await openToReview('A,a.example.com\nB,b.example.com\nC,c.example.com');
  await page.click('#bulk-create-submit');
  await page.waitForSelector('#undo-toast');
  check('3 codes created', count() === 3, count());

  await page.route('**/api/qrcodes/bulk/trash', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) }));
  await page.click('#undo-toast-btn');
  await page.waitForSelector('#undo-toast >> text=Internal server error');
  check('server error shown in the popup', true);
  check('Undo button is still there to retry', await page.isVisible('#undo-toast-btn') && !(await page.isDisabled('#undo-toast-btn')));
  check('nothing deleted by the failed undo', count() === 3);

  await page.unroute('**/api/qrcodes/bulk/trash');
  await page.route('**/api/qrcodes/bulk/trash', (r) => r.abort());
  await page.click('#undo-toast-btn');
  await page.waitForSelector('text=Couldn’t reach the server');
  check('offline undo says it could not reach the server', true);
  await page.unroute('**/api/qrcodes/bulk/trash');

  console.log('Popup is hidden while a modal is open, and returns after');
  await page.click('#bulk-create-btn');
  await page.waitForSelector('#bulk-modal-title');
  check('popup hidden behind the open bulk modal', (await page.locator('#undo-toast').count()) === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('popup back after closing the modal', (await page.locator('#undo-toast').count()) === 1);

  console.log('Popup goes away by itself after 10 minutes');
  await page.clock.fastForward('09:00');
  check('still there at 9 minutes', (await page.locator('#undo-toast').count()) === 1);
  await page.clock.fastForward('01:30');
  await page.waitForTimeout(200);
  check('gone by 10.5 minutes', (await page.locator('#undo-toast').count()) === 0);

  console.log('Partial undo: one code of the batch was already moved to Trash another way');
  await openToReview('P1,p1.example.com\nP2,p2.example.com');
  await page.click('#bulk-create-submit');
  await page.waitForSelector('#undo-toast');
  const ids = sql(`SELECT id FROM qrcodes WHERE user_id=${userId} AND title IN ('P1','P2') ORDER BY id`).split('\n');
  sql(`UPDATE qrcodes SET deleted_at = CURRENT_TIMESTAMP WHERE id=${ids[0]}`);
  await page.click('#undo-toast-btn');
  await page.waitForSelector('text=Undone — 1 QR code moved to Trash.');
  const msg = await page.textContent('#undo-toast');
  check('reports 1 moved and 1 that was already gone', /1 QR code moved to Trash\. 1 couldn’t be moved \(already gone\)/.test(msg), msg);
  check('both are in Trash afterwards', Number(sql(`SELECT COUNT(*) FROM qrcodes WHERE id IN (${ids.join(',')}) AND deleted_at IS NOT NULL`)) === 2);
  check('neither is on the dashboard', (await page.locator('h3:has-text("P1")').count()) === 0 && (await page.locator('h3:has-text("P2")').count()) === 0);

  await browser.close();
  finish();
});
