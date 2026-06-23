# BetterTimes Dashboard

Internal tool for tracking how proactive the business is with its clients. It
answers the question a coloured spreadsheet can't: **who haven't we contacted,
and who recently had a problem?**

## What it shows

- **Attention queue** (`/`) — every client sorted by who needs contact most.
  Surfaces overdue clients (past their cadence) and anyone with a recent
  reactive issue. This is the screen to work from each morning.
- **Calendar** (`/calendar`) — the familiar client × day grid, rebuilt from the
  database. Each cell is a logged check-in, coloured by type. Scrollable in both
  directions (the date header and client column stay frozen), with a date-range
  selector and per-type filter.
- **Log check-in** — click any day cell, or use **Log check-in** in the nav, to
  add a check-in (client, type, date, optional topic/notes). The dashboard
  updates immediately.
- **Attribution** — every check-in records who logged it. Hover a cell or open
  its day menu to see what was logged and by whom.

## Check-in types

Three types are built in; you can add your own (with a custom colour) via
**Manage categories** on the calendar.

| Type | Meaning |
|---|---|
| 🟢 Proactive | We reached out / fixed something before the client raised it |
| 🔴 Tickets | The client contacted us with an issue (stored as `reactive`) |
| 🟡 Onboarding | Onboarding-phase contact |

A client is **overdue** when the days since their last check-in exceed their
`cadence_days` (default **7**).

## Accounts & auth

The app is gated by Supabase Auth (email + password). Unauthenticated requests
are redirected to `/login`; the data layer is protected by RLS that requires an
authenticated user, so the anon key alone reads nothing.

- **Sign in / create accounts** at `/login`. Account creation is open while
  onboarding users — turn off **Allow new users to sign up** in the Supabase
  dashboard once the team's accounts exist.
- **Display name** — each user can set a nickname from the account menu (top
  right). That name is what appears against their check-ins.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- `@supabase/ssr` for cookie-based sessions; auth gate in `proxy.ts`
- Supabase (Postgres) — project `BetterTimes Dashboard` (`naejcnpxbsfcprklfnvv`)

> Note: this Next.js version has breaking changes from older releases — most
> notably `middleware` is now `proxy.ts`. See `AGENTS.md` and
> `node_modules/next/dist/docs/` before changing framework-level code.

## Local development

```bash
npm install
npm run dev   # http://localhost:3000
```

Environment (`.env.local`, not committed):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Data model

- `clients` — name, status (`onboarding` / `active` / `churned`), `cadence_days`
- `check_ins` — client, `occurred_on`, `type`, optional `topic` / `notes`,
  `created_by` (auth user id, defaults to the logged-in user)
- `check_in_types` — the check-in categories: `slug`, `label`, `color`,
  `precedence` (lower = more notable when several land on one day)
- `profiles` — public `id` + `display_name`, kept in sync with auth users so
  names are readable across accounts for attribution

Metrics (days-since-contact, overdue, proactive rate, risk ranking) are computed
in `lib/metrics.ts`, not stored.

## Spreadsheet import (one-time)

The original tracker (`data/`) was imported once. Cells were hand-coloured and
each held a `*`; the colour encoded the type:

- `FF00B050` green → proactive
- `FFFFFF00` yellow → onboarding
- `FFFF0000` red → reactive

Re-run against a workbook with: `python3 scripts/import_xlsx.py <file.xlsx>`
(writes `/tmp/seed.sql`). Going forward, log check-ins in the app — the
spreadsheet is no longer the source of truth.

## Deployment

Host on Vercel (or any Next.js host) with the two `NEXT_PUBLIC_SUPABASE_*` env
vars set. The Supabase project is already configured with auth and RLS.

## Known follow-ups

- **Integration.** To embed into the existing business app, the Supabase REST
  API is the seam — pending that app's stack.
