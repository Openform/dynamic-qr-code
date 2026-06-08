This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Database & Environment

The app uses **MySQL/MariaDB** (via [`mysql2`](https://github.com/sidorares/node-mysql2)). Copy `.env.example` to `.env.local` and fill in the values:

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` — connection details
- `MYSQL_CONNECTION_LIMIT` — pool size (keep low on shared hosting; default 5)
- `JWT_SECRET` — secret for signing auth tokens
- `BASE_URL` — public URL used to build QR redirect links

Tables are created automatically on first run. You can also import [`schema.sql`](schema.sql) manually (e.g. via phpMyAdmin).

### Deploying on Hostinger (Business shared hosting)

1. **Databases → MySQL**: create a database and user, and assign the user to it.
2. **Node.js app**: point it at this project and set the environment variables above (`MYSQL_HOST` is usually `localhost`).
3. Build and start the app (`npm run build`, then `npm run start`). The schema is created on the first request, or import `schema.sql` beforehand.

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
