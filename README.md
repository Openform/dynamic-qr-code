This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Database & Environment

The app uses **MySQL/MariaDB** (via [`mysql2`](https://github.com/sidorares/node-mysql2)). Copy `.env.example` to `.env.local` and fill in the values:

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` — connection details
- `MYSQL_CONNECTION_LIMIT` — pool size (keep low on shared hosting; default 5)
- `JWT_SECRET` — secret for signing auth tokens
- `BASE_URL` — public URL used to build QR redirect links
- `SIGNUP_INVITE_CODE` — shared code required on the public `/register` page
- `ADMIN_EMAILS` — comma-separated emails of the accounts allowed into the admin dashboard
- `ANALYTICS_SECRET` — secret for the anonymous visitor IDs used to count unique scanners (falls back to `JWT_SECRET`)
- `ANALYTICS_RETENTION_MONTHS` — how long detailed scan records are kept (default `24`; `0` keeps them forever)

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

## Scan analytics

Every scan of a code is recorded after the visitor has been redirected, so
recording never slows a scan down. Each account sees its analytics at
**Analytics** in the dashboard header (`/dashboard/analytics`), or for one code
from the **📈 Analytics** link on its card. Admins see every account at
**Platform analytics** on `/admin/analytics`.

The dashboard shows scans and unique scanners over time (with the change vs.
the previous period), countries and cities, device type, OS, browser or app,
language, a day × hour grid of when people scan, top codes, recent scans, and
for a single code the scans each destination URL got while it was live. Any
range can be downloaded as CSV.

What's stored per scan (`scan_events` table): time (UTC), country, region,
city, device type, OS, browser, language, and an anonymous visitor ID (a keyed
hash of IP + browser). **IP addresses are never stored.** Link-preview bots
(WhatsApp, Slack, Facebook…) and crawlers are recorded but left out of every
chart and of each code's scan count.

- **Earlier scans:** scans from before analytics existed only count toward
  totals; the dashboard says so.
- **Retention:** rows older than `ANALYTICS_RETENTION_MONTHS` are deleted
  automatically (checked once a day). Each code's total scan count is kept.
- **Deleting** a code or account deletes its scan records too.

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
