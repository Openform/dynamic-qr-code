# End-to-end tests

These drive a **running** copy of the app the way a person (or a phone) would, and
read the database directly to check what really happened: sign-ups and API calls,
the dashboard in a real browser, short links being scanned, and rows in MySQL.
The fast unit tests (`npm test`) cover the pure logic; these cover the parts that
only show up when everything is wired together: transactions and row locks,
package limits under concurrent requests, what the redirect and analytics do with
a deleted code, and what the dialogs and popups actually do.

```bash
npm run dev            # terminal 1: the app, against the TEST database
npm run e2e            # terminal 2: everything (a few minutes)
npm run e2e:api        #   only the API suites (no browser needed, ~15 s)
npm run e2e:browser    #   only the browser suites
npm run e2e -- trash-api select-mode    # just these
npm run e2e -- --list
```

## Read this first: they write to the database

The suites create accounts and codes, change packages, backdate rows, and delete
things by SQL. **Point them at a throwaway database, never a real one.** To make a
mistake hard, they refuse to start unless:

- the app (`E2E_BASE_URL`, default `http://localhost:3000`) and the database host
  are local, and
- the database name contains `test` or `e2e`.

`E2E_ALLOW_REMOTE=1` and `E2E_ALLOW_ANY_DB=1` override those, for a throwaway
server or a differently named test database. They don't clean up after
themselves: when the test database gets cluttered, drop it and let the app recreate
the schema.

## Setup

1. **A test database** (MySQL or MariaDB), e.g. `qr_test`, and a user for it.
2. **`.env.local`** in the repo root, the same file `npm run dev` reads, with at
   least:

   ```
   MYSQL_HOST=127.0.0.1
   MYSQL_USER=...
   MYSQL_PASSWORD=...
   MYSQL_DATABASE=qr_test
   JWT_SECRET=any-long-random-string
   SIGNUP_INVITE_CODE=any-invite-code        # the suites sign accounts up with it
   BASE_URL=http://localhost:3000            # what short links are built from
   ADMIN_EMAILS=admin@example.com            # optional: enables the admin checks
   ```

   The suites read the database settings from the same file, so they and the
   server always talk to the same database.
3. **Start the app** with `npm run dev` (the schema is created on first request).
4. **Playwright**, for the browser suites. It isn't a dependency of the app (it
   downloads browsers), so install it where you run the tests:
   `npm i -D playwright && npx playwright install chromium` (or install it
   globally). Without it the browser suites are reported as *skipped*, loudly, not
   passed.

## What's covered

| Suite | Kind | What it checks |
| --- | --- | --- |
| `bulk-create-api` | API | Bulk creation is all-or-nothing, respects the package limit (including two simultaneous batches), the 200-row cap and the hourly throttle; validation; style and collection handling; the single-create route's shared validation. |
| `trash-surfaces` | API | Every place that reads codes treats a trashed code like a deleted one (list, stats, limit counts, edit/image routes, redirect, analytics totals and exports, collection counts, admin views) and that restore brings it all back. |
| `trash-api` | API | Trash / restore / delete-forever endpoints: ownership, idempotency, request validation, restore against the package limit (and races), "delete forever" refusing live codes, batching, 30-day expiry (viewing Trash and the global housekeeping purge). |
| `schema-migration` | API | A fresh database gets the schema, running it twice is harmless, and a pre-Trash database is migrated in place. Needs a privileged user (below); skipped otherwise. |
| `bulk-create-ui` | browser | The bulk-create modal end to end: style, pasting and uploading rows (semicolons, Windows-1252, headers), validation, review, create, CSV download, undo, limits, phone layout. |
| `bulk-create-errors` | browser | Failure paths a healthy server can't produce: a dropped connection, server rejections, a failing undo, popup expiry (fake clock). |
| `select-mode` | browser | Select mode, shift-click ranges, select-all-in-view following the filters, the confirm dialog, move to Trash, the undo popup, Escape with stacked dialogs. |
| `trash-view` | browser | The Trash view: countdowns, restore, delete forever and Empty Trash with typed confirmation, restore refused at the limit, moving between views. |
| `collection-delete` | browser | Deleting a collection with and without moving its codes to Trash (ownership, atomicity, codes already in Trash) and its dialog. |
| `admin-dialog` | browser | The admin dashboard's disable and delete dialogs (shared with the Trash flows). Skipped without an admin account. |

The housekeeping job's own logic (once a day, one job failing doesn't stop the
other) is a unit test: `src/lib/__tests__/scanRecorder.test.js`.

## Optional extras

- **Admin account.** Set `ADMIN_EMAILS` in `.env.local`. The suites create that
  account if it doesn't exist (password `Sup3r-secret-pw!`) or sign in to it if a
  previous run did; if it exists with another password, the admin checks are
  skipped.
- **`schema-migration`** creates and drops a scratch database, which the app's
  own user shouldn't be able to do. Give it a user that can:
  `E2E_SCHEMA_ADMIN_USER=... E2E_SCHEMA_ADMIN_PASSWORD=... npm run e2e`.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:3000` | The running app. Keep `BASE_URL` in `.env.local` equal to it. |
| `E2E_ARTIFACTS` | `e2e/.artifacts` | Screenshots and downloads (git-ignored), one folder per suite. |
| `E2E_ALLOW_REMOTE` | unset | `1` allows a non-local app or database host. |
| `E2E_ALLOW_ANY_DB` | unset | `1` allows a database name without `test` or `e2e`. |
| `E2E_SCHEMA_ADMIN_USER`, `E2E_SCHEMA_ADMIN_PASSWORD` | unset | A user that can create and drop databases, for `schema-migration`. |
| `MYSQL_*`, `SIGNUP_INVITE_CODE`, `ADMIN_EMAILS`, `BASE_URL` | from `.env.local` | The same settings the app uses. |

Runner flags: `--api`, `--browser`, `--list`, `--verbose` (stream every suite's
output; by default only failures are printed) and `--strict` (a skipped suite
fails the run). Exit codes: 0 all good, 1 a suite failed, 2 refused to run or no
app to test; a suite that can't run exits 3 and is reported as skipped.

## Notes

- **Time.** About 2–3 minutes in all, most of it the browser suites. On the dev
  server the first request to each route also pays a compile cost.
- **Rate limits.** The app limits sign-ups and bulk batches per IP or account. The
  suites send a random `x-forwarded-for` and create a new account per scenario, so
  that doesn't get in the way; if you run against a server that ignores that
  header, expect the sign-up limit (10 per 15 minutes) to bite.
- **Not included:** screenshot comparison. Baseline images depend on the machine's
  fonts and rendering, so they aren't committed; the suites do save screenshots to
  the artifacts folder for you to look at.
- **Adding a suite.** Copy a small one, import what you need from
  `lib/harness.mjs` (`register`, `api`, `scan`, `sql`, `check`, `launchBrowser`,
  …), end with `finish()`, and add it to `SUITES` in `run.mjs`.
  `sql()` is synchronous but blocks while it waits, so prefer one query that counts
  over a loop of small ones between HTTP requests.
