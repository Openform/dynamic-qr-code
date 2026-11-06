// The admin dashboard's confirmation dialogs, which share ConfirmActionModal with the
// dashboard's Trash flows: disabling an account, and deleting one (typed email).
import { check, config, cookieFor, finish, launchBrowser, register, registerOrLogin, run, skip, sql, stamp, waitFor } from '../lib/harness.mjs';

run(async () => {
  if (!config.adminEmail) skip('ADMIN_EMAILS is not set, so there is no admin account to sign in as');
  const admin = await registerOrLogin(config.adminEmail, { name: 'Admin' });
  if (!admin) skip(`couldn't sign in as ${config.adminEmail} (it exists with a different password)`);

  // A throwaway account to disable and delete, so nothing real is touched.
  const email = `admin-dialog-${stamp}@example.com`;
  const target = await register(email, { name: `Dialog Target ${stamp}` });

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([cookieFor(admin)]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  let nativeDialog = null;
  page.on('dialog', async (dialog) => {
    nativeDialog = dialog.message();
    await dialog.dismiss();
  });

  await page.goto(`${config.baseUrl}/admin`);
  await page.fill('input[placeholder="Search by name or email…"]', email);
  const row = page.locator('tr', { hasText: email });
  await row.waitFor();
  const dialogTitle = page.locator('#confirm-action-title');
  const confirm = page.locator('.modal-card button[type="submit"]');
  const disabledAt = () => sql(`SELECT disabled_at IS NOT NULL FROM users WHERE id=${target.userId}`) === '1';

  console.log('Disable');
  await row.locator('button:has-text("Disable")').click();
  await dialogTitle.waitFor();
  check('the dialog names the account', (await dialogTitle.textContent()) === `Disable Dialog Target ${stamp}?`);
  check('and offers Disable account', (await confirm.textContent()).includes('Disable account'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes it', (await dialogTitle.count()) === 0);
  check('without disabling anything', !disabledAt());
  await row.locator('button:has-text("Disable")').click();
  await dialogTitle.waitFor();
  await confirm.click();
  check('confirming disables the account', await waitFor(disabledAt));

  console.log('Delete (typed confirmation)');
  await row.locator('button:has-text("Delete")').click();
  await dialogTitle.waitFor();
  check('the confirm button is disabled until the email is typed', await confirm.isDisabled());
  await page.fill('#confirm-action-text', 'not the email');
  check('and stays disabled for the wrong text', await confirm.isDisabled());
  await page.fill('#confirm-action-text', email.toUpperCase());
  check('the right email enables it (any case)', !(await confirm.isDisabled()));
  await confirm.click();
  check('the account is deleted', await waitFor(() => sql(`SELECT COUNT(*) FROM users WHERE id=${target.userId}`) === '0'));

  check('no native browser dialogs were used', nativeDialog === null, nativeDialog);
  check('no page errors', pageErrors.length === 0, pageErrors);
  await browser.close();
  finish();
});
