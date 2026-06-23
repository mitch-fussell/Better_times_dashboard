# BetterTimes Dashboard

Internal tool for tracking how proactive the business is with its clients. It
answers the question a coloured spreadsheet can't: **who haven't we contacted,
and who recently had a problem?**

## What it shows

- **Attention queue** (`/`) — every client sorted by who needs contact most.
  Surfaces overdue clients (past their cadence) and anyone with a recent
  reactive issue. This is the screen to work from each morning.
- **Calendar** (`/calendar`) — the familiar client × day grid, rebuilt from the
  database. Green = proactive, red = reactive, amber = onboarding.
- **Log check-in** — add a check-in (client, type, date, optional topic/notes)
  from anywhere; the dashboard updates immediately.

## Check-in types

| Type | Meaning |
|---|---|
| 🟢 Proactive | We reached out / fixed something before the client raised it |
| 🔴 Reactive | The client contacted us with an issue |
| 🟡 Onboarding | Onboarding-phase contact |

A client is **overdue** when the days since their last check-in exceed their
`cadence_days` (default **7**).

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Postgres) — project `BetterTimes Dashboard` (`naejcnpxbsfcprklfnvv`)

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
- `check_ins` — client, `occurred_on`, `type`, optional `topic` / `notes`

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

## Known follow-ups

- **Auth.** RLS currently grants the `anon` role full read/write so the app
  works without login. Add Supabase Auth and tighten the policies before this is
  exposed beyond trusted users.
- **Deployment.** Needs a host (e.g. Vercel) with the two env vars set.
- **Integration.** To embed into the existing business app, the Supabase REST
  API is the seam — pending that app's stack.
