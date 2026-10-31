# Brightloop Software

Subscription billing for Brightloop Software.

Recurring billing for products sold on plans: quotations, subscriptions, a billing
run that creates invoices, taxes, discounts, payments, overdue tracking, a finance
dashboard and a customer portal.

Node + Express + SQLite on the server, React + Vite in `frontend/`. It runs fully
offline: no external APIs, no CDN, and email goes to the console.

## Requirements

- Node.js **22.5 or newer** (SQLite is built in as `node:sqlite`, so there is nothing native to compile)
- npm 10+

## Run it

```
npm install
npm run seed
npm run dev
```

- Website: http://localhost:5173 (Vite moves to 5174 if 5173 is busy)
- API: http://localhost:4000

`npm run dev` starts both. The server runs the billing job when it starts and
every hour after that, so seeded subscriptions have invoices straight away.

## Seed accounts

| Role     | Email                 | Password     |
| -------- | --------------------- | ------------ |
| Admin    | admin@example.com     | Admin@12345  |
| Staff    | staff@example.com     | Staff@12345  |
| Customer | customer@example.com  | Customer@123 |
| Customer | customer2@example.com | Customer@123 |

The large seed adds 500 more customers (for example `nikhil.banerjee1@example.com`),
all with the password `Customer@123`. Every email uses `example.com`, which never delivers.

## Scripts

| Command                   | What it does                                                  |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | API and website together, both reloading on change            |
| `npm run seed`            | Accounts, catalog, four demo subscriptions and a 10% discount |
| `npm run seed:large`      | Adds 500 customers, 5,250 subscriptions and 50,000 invoices   |
| `npm run bench -w server` | Times the heavy pages against the current database            |
| `npm test`                | Server tests: billing rules, roles, payments, security        |
| `npm run lint`            | ESLint                                                        |
| `npm run format`          | Prettier                                                      |
| `npm run build`           | Production build of the website into `frontend/dist`          |

Seeding is safe to repeat: it only adds what is missing. To start over, stop the
server and delete `server/data/app.db*`.

## Settings

All optional. Put them in the environment before starting the server.

| Variable                   | Default                 | Notes                                          |
| -------------------------- | ----------------------- | ---------------------------------------------- |
| `PORT`                     | `4000`                  |                                                |
| `JWT_SECRET`               | dev-only value          | **Required** when `NODE_ENV=production`        |
| `DB_PATH`                  | `server/data/app.db`    |                                                |
| `CLIENT_URL`               | `http://localhost:5173` | Used in reset links and the origin check       |
| `BILLING_INTERVAL_MINUTES` | `60`                    | `0` turns the automatic billing run off        |
| `AUTO_CONFIRM_INVOICES`    | `true`                  | `false` leaves new invoices as editable drafts |

## How it works

### Layout

```
shared/validation/    Zod schemas used by both the API and the forms
server/src/
  routes/             thin HTTP handlers: parse, check role, call a service
  services/           billing, tax, discounts, lifecycle, invoices, payments, dashboard
  middleware/         auth, roles, validation, rate limits, security headers, errors
  db/                 schema.sql, migrations, seed and large seed
  lib/                money, dates, pagination, mailer, audit log
server/tests/         node:test + Supertest
frontend/src/
  pages/  components/  api/  styles/
```

Anything that calculates money or changes state is in `services/`, and the money
rules themselves (`tax.js`, `discounts.js`, `invoiceMath.js`, `lifecycle.js`) touch
no database at all, so they are tested directly.

### Money and dates

- Money is integer **paise** everywhere. Rupees only appear in forms and on screen.
- Tax rates are **basis points** (1800 = 18%). Tax is worked out per line and the
  invoice total is rounded once.
- Dates are `YYYY-MM-DD` in UTC. Monthly billing is counted from the start date,
  so a subscription that starts on the 31st returns to the 31st after short months.

### Rules worth knowing for the demo

- **Lifecycle:** draft → quotation → confirmed → active → closed, one step at a
  time. Anything else is rejected with the allowed next step.
- **No double billing:** a unique index on `invoices(subscription_id, period_start)`.
  Run billing twice, or retry after a crash, and the second run creates nothing.
- **Plan end behaviour:** `auto_close` bills up to expiry then closes;
  `manual_close` stops billing and waits for staff; `renewable` keeps going and
  moves the expiry forward; `pausable` can be paused, and paused months are never billed.
- **Discounts:** the best one per product and the best one for the whole invoice,
  checked for dates, usage limit and minimums. Usage is counted in the same
  transaction as the invoice.
- **Invoices:** drafts can be edited. A confirmed invoice cannot; it can only be
  paid or cancelled (if it has no payments). It becomes **paid** only when payments
  add up to the full total.
- **Overdue:** confirmed, unpaid and past the due date, worked out in the query
  rather than stored.
- **Roles:** admins do everything; staff manage subscriptions, invoices and payments
  but not discount rules; customers see only their own records (other ids return 404)
  and can pay their own invoices online.

### Security

- bcrypt passwords, JWT in an httpOnly SameSite cookie, re-checked against the
  database on every request, so a role change or deleted account applies at once.
- Changing or resetting a password signs out every other session.
- Reset links expire after 30 minutes, work once, and are stored only as a hash.
  In development the link is printed in the server console.
- Rate limits on login, signup and password reset. Origin check on writes.
  Security headers, and `no-store` on every API response.
- An audit log of payments, status changes, invoice edits, discount changes,
  new users and billing runs (Admin → Activity).

### Performance

With `npm run seed:large` (5,250 subscriptions, 50,000 invoices, about 40,000
payments), measured with `npm run bench -w server`:

| Page                              | Median  |
| --------------------------------- | ------- |
| Dashboard                         | ~470 ms |
| Subscriptions list, any page      | < 25 ms |
| Overdue invoices                  | ~115 ms |
| Invoice list, page 2,000          | ~240 ms |
| CSV export of all 50,000 invoices | ~1.6 s  |

Totals are aggregated in SQL, every list is paginated, and the website caches
queries and loads each page's code only when it is opened.

## Demo walkthrough

1. **Sign up** as a new customer: the password rules tick off as you type.
2. **Product launch:** as admin, add a product with a variant, a plan, and a tax rule.
3. **Quote to subscription:** as staff, create a subscription from the starter
   template, then send as quotation → confirm → activate.
4. **Billing day:** Invoices → _Run billing now_. Run it again and it creates nothing.
5. **Discount:** as admin, add a 10% discount, set billing to a later date, run it,
   and open the new invoice to see the discount before tax.
6. **Payment:** record a partial payment (still unpaid), then the rest (paid).
   Log in as a customer and pay an invoice online.
7. **Finance dashboard:** after `npm run seed:large`, open the dashboard and quote
   the "calculated in" time shown at the top.
8. **Privacy:** log in as `customer@example.com` and try another customer's
   invoice URL: it shows "not found".
9. **Offline:** disconnect from the internet and repeat any step.

## Team workflow

- `main` is protected and only takes reviewed, working code. Branches look like
  `feat/billing-run` or `fix/discount-expiry`.
- Every pull request gets one review from the owner listed in `.github/CODEOWNERS`.
  Keep pull requests under about 300 lines.
- Short imperative commit messages, such as `add discount usage limit check`.
- Run `npm run format`, `npm run lint` and `npm test` before opening a pull request.
