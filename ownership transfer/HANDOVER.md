# BetterTimes Dashboard — Handover & Setup Guide

This document is for a developer taking over the project and pointing it at **their
own Supabase database** instead of the original. It covers the stack, the code
layout, the full database schema (as copy-pasteable SQL), the auth/security model,
local development, data import, and deployment.

For a product-level overview of what the app does, see [`README.md`](../README.md).

---

## 1. What it is

A small internal CRM-style dashboard for tracking client check-ins. Two screens:

- **`/`** — an "attention queue": clients ranked by who needs contact most (overdue
  vs. their cadence, recent reactive issues).
- **`/calendar`** — a client × day grid; each cell is a logged check-in, coloured by
  type. Click a cell to log one.

All metrics (days-since-contact, overdue, risk ranking) are **computed at request
time** in `lib/metrics.ts` — nothing is precomputed or stored.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.9** (App Router, Turbopack) | ⚠️ See §11 — this version renames `middleware` → `proxy` and has other breaking changes. |
| Language | TypeScript 5 | |
| UI | React 19, Tailwind CSS v4 | Tailwind v4 uses `@tailwindcss/postcss`; no `tailwind.config.js` by default. |
| Backend | **Supabase** (Postgres + Auth) | Accessed via `@supabase/ssr` 0.12 and `@supabase/supabase-js` 2.x. |
| Hosting | Vercel | Auto-deploys on push to `main`. |

There is **no separate API server** — the Next.js app talks to Supabase directly
(browser client for writes, server client for reads), and Postgres Row-Level
Security (RLS) is the security boundary.

---

## 3. Repository layout

```
app/
  layout.tsx            Root layout
  globals.css           Tailwind entry + brand colors
  page.tsx              Dashboard (attention queue) — Server Component
  calendar/page.tsx     Calendar grid — Server Component, force-dynamic
  login/page.tsx        Sign in / sign up — Client Component
components/
  NavBar.tsx            Top bar (Log check-in + AccountMenu)
  AccountMenu.tsx       Name/rename, change password, sign out
  AttentionQueue.tsx    Dashboard list + client filter
  ClientCombobox.tsx    Searchable client dropdown
  CalendarGrid.tsx      The interactive calendar (client component)
  CheckInModal.tsx      Modal for logging a check-in
  LogCheckIn.tsx        "Log check-in" launcher
  ManageCategories.tsx  Add/edit check-in categories
lib/
  metrics.ts            Domain types + all "who needs attention" logic
  data.ts               fetchData(): server-side reads (clients, check_ins, types, profiles)
  supabase.ts           Browser Supabase client (cookie sessions)
  supabase-server.ts    Server Supabase client (reads cookies)
proxy.ts                Auth gate (formerly middleware.ts) — runs before routes
scripts/import_xlsx.py  One-time spreadsheet → SQL importer
data/                   Source spreadsheets (gitignored)
```

---

## 4. Environment variables

The app needs exactly two, both safe to expose to the browser (the `anon`/publishable
key is *meant* to be public — RLS + Auth are what protect data):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon or sb_publishable_ key>
```

- **Local:** put them in `.env.local` (gitignored).
- **Vercel:** Project → Settings → Environment Variables.

Both come from your Supabase project: **Project Settings → API** (URL) and **API Keys**
(publishable / anon key).

---

## 5. Local development

```bash
npm install
# create .env.local with the two vars from §4 (it is gitignored)
npm run dev                         # http://localhost:3000
```

Scripts: `npm run dev`, `npm run build`, `npm run start` (production server),
`npm run lint`. Node 20+ recommended.

To verify a production build locally (this is the exact artifact Vercel serves):

```bash
npm run build && npm run start
```

---

## 6. Database — full setup SQL

This recreates the **entire schema** on a fresh Supabase project. Open your project's
**SQL Editor**, paste the whole block, and run it. It is idempotent enough to run once
on an empty database.

```sql
-- ─────────────────────────────────────────────────────────────
-- BetterTimes Dashboard — schema, RLS, triggers, seed data
-- ─────────────────────────────────────────────────────────────

-- 1. Clients
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  status       text not null default 'active'
                 check (status in ('onboarding', 'active', 'churned')),
  cadence_days integer not null default 7,
  created_at   timestamptz not null default now()
);

-- 2. Check-in categories (built-ins seeded below; users can add more)
create table public.check_in_types (
  slug       text primary key,
  label      text not null,
  color      text not null,          -- hex, e.g. #10b981
  precedence integer not null default 100,  -- lower = more notable on a shared day
  created_at timestamptz not null default now()
);

-- 3. Check-ins (the events)
create table public.check_ins (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  occurred_on date not null,
  type        text not null references public.check_in_types(slug),
  topic       text,
  notes       text,
  created_at  timestamptz not null default now(),
  -- who logged it; auto-stamped from the JWT so client code never sets it
  created_by  uuid default auth.uid() references auth.users(id) on delete set null
);

create index on public.check_ins (client_id);
create index on public.check_ins (occurred_on);

-- 4. Public profiles (display names, readable across accounts for attribution)
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  updated_at   timestamptz not null default now()
);

-- ── Row-Level Security ──────────────────────────────────────
-- The whole app requires a logged-in user. The anon role gets nothing.
alter table public.clients        enable row level security;
alter table public.check_ins      enable row level security;
alter table public.check_in_types enable row level security;
alter table public.profiles       enable row level security;

create policy "authenticated full access" on public.clients
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.check_ins
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.check_in_types
  for all to authenticated using (true) with check (true);

-- Profiles: everyone signed in can read names; you can only edit your own.
create policy "authenticated read profiles" on public.profiles
  for select to authenticated using (true);
create policy "users manage own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── Profile sync trigger ────────────────────────────────────
-- Mirrors each auth user's display_name (from sign-up metadata or later
-- updates) into the public profiles table. SECURITY DEFINER so it can write
-- profiles regardless of who triggered it.
create or replace function public.sync_profile()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, updated_at)
  values (new.id, nullif(new.raw_user_meta_data->>'display_name', ''), now())
  on conflict (id) do update
    set display_name = excluded.display_name, updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update on auth.users
  for each row execute function public.sync_profile();

-- ── Seed the built-in check-in categories ───────────────────
insert into public.check_in_types (slug, label, color, precedence) values
  ('reactive',   'Tickets',    '#ef4444', 10),
  ('onboarding', 'Onboarding', '#fbbf24', 20),
  ('proactive',  'Proactive',  '#10b981', 30)
on conflict (slug) do nothing;
```

### Schema reference

| Table | Purpose | Key columns |
|---|---|---|
| `clients` | The companies/people tracked | `name` (unique), `status`, `cadence_days` |
| `check_in_types` | Categories shown as coloured chips | `slug` (PK), `label`, `color`, `precedence` |
| `check_ins` | One logged contact event | `client_id`→clients, `type`→check_in_types, `occurred_on`, `created_by`→auth.users |
| `profiles` | Public display names per user | `id`→auth.users, `display_name` |

Notes:
- `check_ins.created_by` **defaults to `auth.uid()`**, so client inserts never set it —
  the DB stamps the logged-in user automatically. That's how attribution works.
- `clients.name` is **unique**, which lets the importer upsert with `on conflict (name)`.
- `reactive` is the stored slug; its **label is "Tickets"** in the UI.

---

## 7. Auth & security model

- **Sessions** are cookie-based via `@supabase/ssr`. The browser client
  (`lib/supabase.ts`) stores the session in cookies; the server client
  (`lib/supabase-server.ts`) reads them in Server Components.
- **`proxy.ts`** (the file formerly known as `middleware.ts`) runs on every
  non-asset request. It revalidates the session with `getUser()` and redirects
  unauthenticated users to `/login` (and signed-in users away from `/login`). This is
  an *optimistic UX gate only*.
- **The real boundary is RLS.** Every table requires the `authenticated` role, so a
  leaked anon key reads nothing without a valid login. Never rely on `proxy.ts` for
  security — rely on the policies in §6.

### Creating users

There's no public "first user" flow you'd want to leave open. Options:
1. Use the in-app **`/login` → "Create a new account"** form (calls
   `supabase.auth.signUp` with a `display_name`), then in Supabase turn **off**
   *Authentication → Sign In / Providers → Allow new users to sign up* once your team's
   accounts exist.
2. Or create users directly in the Supabase dashboard (**Authentication → Users**).

Either way, the `sync_profile` trigger creates their `profiles` row automatically.

**Recommended Supabase Auth settings:** turn **off** *Confirm email* for a small
internal team (avoids the shared-SMTP rate limit and lets accounts work instantly).

---

## 8. Pointing the app at YOUR Supabase — checklist

1. **Create a Supabase project** at supabase.com.
2. **Run the SQL in §6** in the project's SQL Editor.
3. In **Authentication → Providers → Email**, decide on *Confirm email* / *Allow
   sign-ups* (see §7).
4. **Create at least one user** (§7) so you can log in.
5. Grab **Project URL** and **anon/publishable key** (Project Settings → API).
6. Set the two env vars (§4) locally (`.env.local`) and in Vercel.
7. `npm run dev` and sign in. Empty calendar = working; now seed data (§9) or log
   check-ins by hand.

That's the whole swap — no code changes are required to use a different database, only
the two environment variables.

---

## 9. Seeding data from a spreadsheet (optional)

`scripts/import_xlsx.py` does a one-time import of the original hand-coloured tracker
into SQL. It expects a sheet named **"May 2026"** with client names in column B
(rows 4–47) and date columns D…BL, where cell **fill colour** encodes the type:

| Fill (ARGB) | Type |
|---|---|
| `FF00B050` green | proactive |
| `FFFFFF00` yellow | onboarding |
| `FFFF0000` red | reactive |

```bash
pip install openpyxl
python3 scripts/import_xlsx.py "data/your-workbook.xlsx"   # writes /tmp/seed.sql
```

Then paste `/tmp/seed.sql` into the Supabase SQL Editor. It upserts clients
(`on conflict (name) do nothing`) and inserts check-ins. Imported rows have
`created_by = null` (no app user), which is a handy way to distinguish imported vs.
app-logged data if you ever need to re-import.

If your spreadsheet's layout differs (column ranges, date mapping, sheet name), adjust
the constants at the top of the script — they're documented in its docstring.

---

## 10. Deployment (Vercel)

1. Import the GitHub repo at **vercel.com/new**.
2. **Framework Preset must be "Next.js".** ⚠️ If it's left as "Other," Vercel deploys
   the build as static files with no routing and **every route 404s** (we hit exactly
   this). Confirm it under Settings → Build and Deployment.
3. Add the two env vars (§4).
4. Deploy. Pushes to `main` auto-deploy thereafter.
5. Sanity check: `/login` returns 200; `/` and `/calendar` 307-redirect to `/login`
   when logged out.

No extra Supabase config is needed for deployment — login is email/password with no
OAuth redirect URLs to register.

---

## 11. ⚠️ This is not the Next.js you may know

Per `AGENTS.md`, this Next.js version has breaking changes from older releases. The big
ones that bite:

- **`middleware` is renamed to `proxy`.** The auth gate lives in root `proxy.ts` and
  exports a `proxy` function + `config.matcher`. Proxy now defaults to the **Node.js
  runtime** (you cannot set `runtime` in a proxy file).
- `cookies()` from `next/headers` is **async** — you must `await` it. Server Components
  can read cookies but cannot set them (the `setAll` in `supabase-server.ts` is a safe
  no-op there).
- Tailwind is **v4** — config is CSS-first (`app/globals.css`), not a JS config file.

Before changing framework-level code, read the bundled docs in
`node_modules/next/dist/docs/` (the proxy reference is at
`01-app/03-api-reference/03-file-conventions/proxy.md`).

---

## 12. Quick reference

| Task | Where |
|---|---|
| Change "who needs attention" logic | `lib/metrics.ts` (`buildHealth`, `rollup`) |
| Change what data is fetched | `lib/data.ts` (`fetchData`) |
| Add/restyle the calendar | `components/CalendarGrid.tsx` |
| Auth redirects | `proxy.ts` |
| Add a check-in category | In-app "Manage categories", or insert into `check_in_types` |
| Default cadence | `clients.cadence_days` default (currently 7) |
