# Subscription Management System

Node + Express + SQLite (built into Node 22.5+) API with a React + Vite client. Runs fully offline.

## Run

```
npm install
npm run seed
npm run dev
```

API: http://localhost:4000, client: http://localhost:5173

## Seed accounts

| Role     | Email                | Password     |
| -------- | -------------------- | ------------ |
| admin    | admin@example.com    | Admin@12345  |
| staff    | staff@example.com    | Staff@12345  |
| customer | customer@example.com | Customer@123 |

## Layout

- `server/src/routes`: thin HTTP handlers
- `server/src/services`: billing, tax, discounts, lifecycle, invoices
- `server/src/db`: schema and seed
- `client/src/pages`: login, subscriptions, invoices

Money is stored as integer paise. Tax rates are basis points (1800 = 18%).
