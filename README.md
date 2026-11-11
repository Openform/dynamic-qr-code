This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Database & Environment

The app uses **MySQL/MariaDB** (via [`mysql2`](https://github.com/sidorares/node-mysql2)). Copy `.env.example` to `.env.local` and fill in the values:

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` — connection details
- `MYSQL_CONNECTION_LIMIT` — pool size (keep low on shared hosting; default 5)
- `JWT_SECRET` — secret for signing auth tokens
- `BASE_URL` — public URL used to build QR redirect links
- `SIGNUP_INVITE_CODE` — shared code required on the public `/register` page
- `RESEND_API_KEY` — the [Resend](https://resend.com) API key used to email the team about each [invite request](#invite-requests). Optional `INVITE_ALERT_FROM` (sender, default `QR Go <mail@qrgo.openform.co.za>`) and `INVITE_ALERT_EMAILS` (comma-separated recipients, default `kenton@openform.co.za`)
- `ADMIN_EMAILS` — comma-separated emails of the accounts allowed into the admin dashboard
- `ANALYTICS_SECRET` — secret for the anonymous visitor IDs used to count unique scanners (falls back to `JWT_SECRET`)
- `ANALYTICS_RETENTION_MONTHS` — how long detailed scan records are kept (default `24`; `0` keeps them forever)
- `STAGING_PASSWORD` — staging site only, never production: puts the whole site behind this password (see [Staging site](#staging-site))

Tables are created automatically on first run.

## Packages & admin dashboard

Every account is on a package that caps how many QR codes it can create
(defined in [`src/lib/packages.js`](src/lib/packages.js)):

| Package    | QR codes  |
| ---------- | --------- |
| Starter    | 5         |
| Business   | 20        |
| Extended   | 50        |
| Enterprise | Unlimited |

Admins (listed in `ADMIN_EMAILS`) see an **Admin** link on their dashboard that
opens `/admin`. From there they can view every account and its usage, create
client accounts on any package, and upgrade or downgrade a package. Accounts
created through the public `/register` page start on Starter.

Downgrading an account below its current number of codes keeps all its
existing codes working; it just can't create new ones until it's back under the
limit. When the `package` column is first added to an existing database, every
account that already exists is set to Enterprise so no one loses access. You can also import [`schema.sql`](schema.sql) manually (e.g. via phpMyAdmin).

### Disabling and deleting accounts

- **Disable** signs the account out straight away and blocks it from signing
  in. Its QR codes stop redirecting: anyone who scans one sees a "This QR code
  is inactive" page (`/code-unavailable`), and those scans aren't counted.
  Nothing is deleted, and **Enable** restores everything.
- **Delete** permanently removes the account with its QR codes and
  collections. An account has to be disabled before it can be deleted, and the
  admin must type the account's email to confirm. Deleted codes show a "QR code
  not found" page. This can't be undone from the app, so keep database backups.
- Admin accounts (those in `ADMIN_EMAILS`) can't be disabled or deleted.

Disabling is stored in the `users.disabled_at` column (`NULL` = active), which
is added automatically on first run. Existing accounts start as active.

### Invite requests

Sign-up is invite-only, so the website's main button is **Request an
invite**. It opens a form asking for name, email, and optionally company,
phone and the plan they're interested in, and promises a reply within 24
hours. Linking to `/#request-invite` opens the form on the landing page (the
`/register` page does this for visitors without a code).

Each request is saved in the `invite_requests` table (created automatically on
first run) and listed at **Invite requests** in the admin header
(`/admin/invites`), with a count of open ones. Open requests are listed oldest
first and flagged when they're close to, or past, 24 hours old. Reply (the
**Reply by email** button opens your mail app), then **Mark done**. Spam can be
deleted.

The team also gets an email for each request, sent through
[Resend](https://resend.com) from `mail@qrgo.openform.co.za` to
`kenton@openform.co.za` (change these with `INVITE_ALERT_FROM` and
`INVITE_ALERT_EMAILS`). Replying to it goes straight to the person who asked.
To turn it on, verify the sending domain (`qrgo.openform.co.za`) in
**Resend → Domains**, create a key in **Resend → API Keys** (sending access is
enough), and set it as `RESEND_API_KEY`. Until it's set, requests are still
saved, and the server log notes that no email was sent. If Resend rejects an
email (for example, an unverified domain), the error is in the server log and
the request is still saved.

The **Email alerts** panel at the top of `/admin/invites` shows whether the
running app has `RESEND_API_KEY` (and where alerts go). **Send test email**
sends one straight away and shows Resend's answer, including its error message
if the key or domain is wrong. After adding or changing the key, restart or
redeploy the app so it picks the key up.

Each IP address can send 5 requests an hour, and requests from simple spam bots
(caught by a hidden field) are dropped.

### Legal pages

Admins edit the Privacy Policy (`/privacy`) and Terms & Conditions (`/terms`)
at **Legal pages** in the admin header (`/admin/legal`). The editor has a
formatting toolbar (headings, bold, italic, lists, links, tables), a live preview and
the "Last updated" date shown on the page. Changes go live as soon as they're
saved.

The text uses a small set of Markdown formatting (see
[`src/lib/markdown.js`](src/lib/markdown.js)). It's never treated as HTML, and
only web, email, phone and on-site links are allowed. Saved text is stored in
the `legal_pages` table, created automatically on first run; until a page is
saved it shows the placeholder text in
[`src/lib/legalDefaults.js`](src/lib/legalDefaults.js).

## Changing a destination later

When editing a code, **Destination change** sets whether a new destination
goes live **Now** or **Later**, at a date and time in the browser's time zone.
Until then the code keeps sending scans to its current destination. Upcoming
changes are listed on the edit screen and on the code's card, each with
**Cancel**. A code can have up to 20 waiting, up to 5 years ahead. Changing the
destination now doesn't cancel them.

A change is stored as a row in `qrcode_destinations` (each code's destination
history) that starts in the future. Wherever the app reads a code's
destination (the redirect, the dashboard, the API), it uses the latest row that
has started, so a change takes effect on the first scan after its time, with no
cron job. Once a change has started it's part of the history and can't be
cancelled; a change that hasn't started doesn't appear in analytics.

## Schedules

A schedule sends a code's scans somewhere else for a while, without changing
its main destination. Open **Schedules** on a code's card (or from its edit
screen) to add one with a name and a URL, and either:

- **On dates**: a start and end date and time, in the browser's time zone.
  For example a Black Friday page from Friday to Monday.
- **Every week**: days of the week, a from and to time, and a time zone (the
  browser's by default). For example Monday to Friday, 07:00–11:00, goes to
  the breakfast menu. An end before the start runs past midnight, so Friday
  22:00–02:00 covers the early hours of Saturday; the same start and end
  means 24 hours. Times follow the local clock in the chosen zone, so they
  stay put when the clocks change: on the night clocks go forward, a window
  starting in the skipped hour goes live when the clock jumps past its
  start; when they go back, a window in the repeated hour is live both times.

More about how they behave:

- **Live, upcoming, off, ended.** The card shows the schedule sending scans
  right now and until when. Each weekly schedule says when it's next live, or
  until when it's live. Schedules can be switched off without deleting them.
  Ended date ranges are kept under **Ended** until deleted, and can be edited
  to run again. Weekly schedules never end.
- **Overlaps are allowed.** When two are live at once, a date range wins over
  a weekly schedule (it's the exception to the routine); otherwise the one
  higher in the list wins; move them with the arrows. The panel warns when
  two date ranges, or two weekly schedules, overlap.
- **Week preview.** Below the list, the next 7 days are drawn as bars
  coloured by where scans go, with gaps for the main destination (including
  any change to it that's waiting). It's worked out with the same function as
  the redirect (`src/lib/schedulePreview.js` asks `resolveDestination` about
  every minute), so it can't disagree with real scans. While a schedule is
  being added or edited, the preview includes the unsaved changes. It can be
  shown in the time zone of any weekly schedule, and as a list.
- **Limits.** A code can have up to 20 schedules that haven't ended.
- **Packages.** Business, Extended and Enterprise can add and edit schedules
  (`schedules` in [`src/lib/packages.js`](src/lib/packages.js)). Starter
  can't. After a downgrade, existing schedules keep working, and can still be
  switched off or deleted.

Schedules are stored in `qrcode_schedules`, created automatically on first
run. The redirect checks a code's switched-on schedules that haven't ended at
every scan (lib/schedules.js), so no cron job is needed, and each scan records
which schedule sent it (`scan_events.schedule_id`). Analytics shows each
schedule's scans under [Destinations](#destinations).

Weekly schedules are sent to the API (`POST /api/qrcodes/[id]/schedules`) as
`{ kind: 'weekly', label, destinationUrl, timeZone, days, startTime,
endTime }`, with `days` as bits (1 = Monday, 2 = Tuesday … 64 = Sunday, so
31 is Monday to Friday) and the times as `"HH:MM"`.

## Password-protected codes

A code can ask for a password before sending people on. Turn on **Ask for a
password after scanning** when creating or editing a code. The card then says
**Password protected**.

- **Scanning.** `/r/<code>` sends people to the code's password page
  (`/r/<code>/unlock`) instead of the destination. The page never names the
  code or its owner. The right password sends them on to wherever the code
  points now, schedules included. Turning the password off opens the code
  straight away.
- **Remembered for 30 days.** After the right password, the browser gets a
  cookie limited to that code's link, so it can skip the page for 30 days. Changing
  or removing the password makes those cookies stop working. The cookie holds
  a signed token (`src/lib/unlock.js`), keyed from `JWT_SECRET`.
- **Wrong passwords** are limited like failed logins: 10 per device (connection
  plus browser) per code, and 50 per connection across all codes, every 15
  minutes. The limit lives in memory, so a restart resets it.
- **Owners can see the password** on the edit screen, so they can share it
  again. It's stored as typed (`qrcodes.access_password`), not hashed: it
  protects the destination URL, which is stored in the same row anyway. The
  edit screen warns not to reuse a password used elsewhere.
- **Rules.** 4 to 64 characters, no tabs or line breaks, spaces at either end
  dropped, letter case counts (`src/lib/accessPassword.js`).
- **Packages.** Business, Extended and Enterprise can set and change passwords
  (`passwords` in [`src/lib/packages.js`](src/lib/packages.js)). Starter
  can't. After a downgrade, codes keep asking for their password, which can
  still be removed but not changed.
- **No script needed.** With JavaScript, the page checks the password without
  reloading, then moves on. Without it, the browser posts the form and gets a
  page that moves on. The redirect can't come straight from the form because
  of the site's `form-action 'self'` security header.

The API takes `accessPassword` on `POST /api/qrcodes` and
`PUT /api/qrcodes/[id]`: a string sets it, `null` or `""` removes it, and
leaving it out keeps it. Codes come back with `accessPassword` (`null` for
none).

## Scan analytics

Every scan of a code is recorded after the visitor has been redirected, so
recording never slows a scan down. Each account sees its analytics at
**Analytics** in the dashboard header (`/dashboard/analytics`), or for one code
from the **📈 Analytics** link on its card. Admins see every account at
**Platform analytics** on `/admin/analytics`.

The dashboard shows scans and unique scanners over time (with the change vs.
the previous period), countries and cities, device type, OS, browser or app,
language, a day × hour grid of when people scan, top codes, recent scans, and
for a single code where its scans were sent (see
[Destinations](#destinations)). For [password-protected codes](#password-protected-codes),
a **Password page** card shows how often people were asked for the password
and how many got through or stopped there. A scan only counts once someone
gets through. Any range can be downloaded as CSV; the last
two columns, **Destination** and **Schedule**, say where each scan was sent
and which schedule sent it (empty for the main destination).

What's stored per scan (`scan_events` table): time (UTC), the destination URL
the scan was sent to and the [schedule](#schedules) that sent it (if any),
country, region, city, device type, OS, browser, language, and an anonymous
visitor ID (a keyed hash of IP + browser). Scans recorded before the
destination was stored have none. **IP addresses are never stored.** Link-preview bots
(WhatsApp, Slack, Facebook…) and crawlers are recorded but left out of every
chart and of each code's scan count.

- **Earlier scans:** scans from before analytics existed only count toward
  totals; the dashboard says so.
- **Password page:** each time someone (not a bot) is shown a code's password
  page is a row in `qrcode_password_prompts`, with when it was shown and, if
  the right password followed, when. Nothing else about the visitor is kept.
- **Retention:** rows older than `ANALYTICS_RETENTION_MONTHS` are deleted
  automatically (checked once a day), scans and password page rows alike.
  Each code's total scan count is kept.
- **Deleting** a code or account deletes its scan records too.

### Destinations

For a single code, **Destinations** lists where its scans in the selected
range went, with scans, unique scanners and, for the main destination, scans
per day while it was live:

- **Main destination**: one row for each destination the code has had, while
  it was live. Changes that haven't started yet aren't shown.
- **Schedules**: one row for each schedule that sent scans, plus switched-on
  schedules that could have. If a schedule's URL was edited, its scans to the
  earlier URL get their own row. A deleted schedule's scans stay, as
  "Deleted schedule".

Every scan lands in exactly one row, so the rows add up to the code's total;
the total's unique scanners count someone who reached two destinations once.
Scans recorded since destinations were stored use the URL and schedule they
were actually sent to. Older scans (before schedules existed) count toward
the main destination that was live at the time.

Selecting a row, or choosing from the **Destination** filter next to the code,
narrows the whole page and the CSV export to those scans. The filter is in the
page URL, so it can be bookmarked: `?code=12&destination=schedule-5`, where the
value is `main`, `period-<id>` (one row of the main destination's history,
`qrcode_destinations.id`) or `schedule-<id>`. The API takes the same
`destination` parameter alongside `codeId`.

The SQL is in `src/lib/scanAnalytics.js` and the grouping in
`src/lib/destinationStats.js`. `src/lib/__tests__/destinationAnalytics.db.test.js`
checks the totals against a real database (see [CI checks](#ci-checks)).

### Location data (DB-IP)

Locations come from a local copy of the free
[DB-IP IP to City Lite](https://db-ip.com/db/lite.php) database, so no
visitor IP is ever sent to a third party. The file is saved to
`data/geoip/dbip-city-lite.mmdb` (~120 MB) and is not committed.

**It's downloaded automatically on every build.** `npm run build` first runs
a `prebuild` step that downloads the latest file if it's missing or more
than 7 days old. That step never fails the build: if DB-IP can't be reached,
it prints a warning and keeps the old file. If there's no file at all, scans
are still recorded, with location "Unknown".

DB-IP publishes a new file each month, so redeploying at least monthly keeps
locations current. To update without a deploy (e.g. from a monthly
**hPanel → Cron Jobs** entry, or over SSH), run this in the app's folder; the
running app reloads the new file automatically:

```bash
npm run geoip:update
```

Scans recorded while the file was missing stay "Unknown", because the IP
address isn't kept to look up later.

The data is licensed CC BY 4.0, which requires the "IP Geolocation by DB-IP"
credit shown on the analytics page. Keep it if you change the page.

### Deploying on Hostinger (Business shared hosting)

1. **Databases → MySQL**: create a database and user, and assign the user to it.
2. **Node.js app**: point it at this project and set the environment variables above (`MYSQL_HOST` is usually `localhost`).
3. Build and start the app (`npm run build`, then `npm run start`). The schema is created on the first request, or import `schema.sql` beforehand.
4. Nothing extra for scan locations: the build downloads the location database (see [Location data](#location-data-db-ip)). Check the build log for "Saved …/dbip-city-lite.mmdb" or "up to date".

`npm run build` uses webpack (`next build --webpack`), not Next's default bundler, Turbopack. From Next.js 16.3, Next's native compiler (`@next/swc-linux-x64-gnu`) needs glibc 2.30, and Hostinger's servers have an older one. The build log shows ``version `GLIBC_2.29' not found``, then Next falls back to its WebAssembly compiler, which only works with webpack. Keep `--webpack` until Hostinger's glibc is 2.30 or newer (check with `ldd --version` over SSH). `npm run dev` still uses Turbopack.

## Staging site

A second copy of the app on Hostinger, at `staging.qrgo.co.za`, for trying
changes before they go live. It deploys from the `staging` branch, just as
production deploys from `main`, and has its own database, so nothing done on
staging touches live codes or scans.

Only people with the staging password get in. With `STAGING_PASSWORD` set,
`src/proxy.js` sends every visitor to a sign-in page first
(`/staging-access`, see `src/lib/stagingAccess.js`). The right password keeps
that browser signed in for 30 days, then sends it on to where it was going.
That includes a scanned code's link, so codes can be tested on a phone. Wrong
passwords are limited to 10 per connection every 15 minutes. Changing the
password signs everyone out. Every page also tells search engines not to
index it, and `robots.txt` turns them all away. Production doesn't set
`STAGING_PASSWORD`, so none of this happens there.

### Using it

1. To try a feature, open a pull request from its branch into `staging` and
   merge it. Hostinger redeploys staging.
2. When it's ready, open a pull request from the same feature branch into
   `main`.
3. Now and then, merge `main` into `staging` so staging doesn't drift from
   production. If it gets messy, reset it: `git checkout staging`,
   `git reset --hard origin/main`, `git push --force-with-lease`.

Codes created on staging point to `staging.qrgo.co.za`. Don't print them or
hand them out.

### Setting it up in hPanel

1. **Databases → MySQL**: create a new database and user just for staging.
   Never point staging at production's database: the app updates its database
   structure on startup, so unreleased changes would reach live data.
2. **Websites → Add website → Node.js web app**: deploy from GitHub, using
   this repository and the `staging` branch. Use the same build and start
   commands and Node.js version as production.
3. **Environment variables**: the same names as production, with these
   values:
   - `MYSQL_*`: the staging database from step 1.
   - `JWT_SECRET`, `ANALYTICS_SECRET`, `SIGNUP_INVITE_CODE`: new values, not
     production's.
   - `BASE_URL`: `https://staging.qrgo.co.za`.
   - `ADMIN_EMAILS`: whoever should see the admin pages on staging.
   - `STAGING_PASSWORD`: the password testers enter.
   - `RESEND_API_KEY`: leave unset. Invite requests are still saved, but no
     emails go out.
4. **Domain**: from the new website's own dashboard, connect
   `staging.qrgo.co.za`. Don't create it under the `qrgo.co.za` website's
   **Domains → Subdomains** page: that page belongs to the production website.

The staging app shares the hosting plan's memory and process limits with
production, so a staging build can briefly slow the live site. Deploy to
staging at quiet times.

## CI checks

Hostinger redeploys whenever `main` or `staging` changes, so every pull request into either branch runs two checks (`.github/workflows/ci.yml`). Make both required in the branch rulesets for `main` and `staging`, so a PR can't merge until they pass.

- **Lint, test and build**: `npm run lint`, `npm test` and a production build with webpack, as on Hostinger.
- **Database migration check**: `scripts/ci/check-migrations.mjs` runs the app's own schema setup (`ensureSchema()` in `src/lib/db.js`) against a throwaway MariaDB. It fails if a change would remove a table, column or row, change an existing value, or break when it runs twice. It also checks that pruning old scans and old password page rows deletes exactly the rows it should. Then the same job runs the tests that need a database (`*.db.test.js`, skipped by `npm test` elsewhere): scans per destination must add up to each code's total, narrowing to a destination must match its row, and a password-protected code must ask for, check and remember its password, with the password page counted in analytics.

The check starts from the schema `main` builds, filled with made-up sample rows (`scripts/ci/seed-data.mjs`). Production has been migrated through older versions, so it can differ from that. To test against production's real structure too, add `scripts/ci/prod-schema.sql`:

1. In phpMyAdmin, select the database, then **Export** → **Custom**. Choose format **SQL** and **Structure** only, with no data. Untick **Add AUTO_INCREMENT value** and **Add CREATE DATABASE / USE statement**.
2. Save the file as `scripts/ci/prod-schema.sql`. Check it holds only `CREATE TABLE` and `ALTER TABLE` statements. **This repo is public: the file must never contain data.** The check refuses a file with `INSERT` statements.
3. Export it again after every deploy that changes the schema.

Keep CI in step with production: the `node-version` in the workflow should match the Node.js version on Hostinger, and the `mariadb` image should match the server version on phpMyAdmin's home page. If production's `sql_mode` isn't the default (`SELECT @@sql_mode;`), set `CI_SQL_MODE` in the workflow.

To run the database check locally, start a throwaway server. The script drops and recreates the database, and refuses any name that doesn't end in `_ci`.

```bash
docker run -d --name qrgo-ci-db -e MARIADB_ROOT_PASSWORD=ci -p 3306:3306 mariadb:11.4
```

```bash
MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci MYSQL_DATABASE=qrgo_ci node scripts/ci/check-migrations.mjs
```

The database tests also drop and recreate their databases, with the same rule about `_ci` (the password test uses its own, with `_passwords_ci` at the end):

```bash
ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci MYSQL_DATABASE=qrgo_ci npx vitest run db.test
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project self-hosts [Inter](https://rsms.me/inter/) with [`next/font/local`](https://nextjs.org/docs/app/getting-started/fonts), so no third-party font service is called. The font file and notes on how it was made are in `src/app/fonts/`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
