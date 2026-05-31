# Stockly

**Mobile-first inventory counting for teams and locations.**

Stockly replaces paper stocktakes and spreadsheets with a fast, collaborative mobile app.
Set up your locations and products once, then run inventory sessions your whole team can count
together in real time — with role- and location-based access keeping everyone scoped to what
they should see.

---

## Overview

- **Create locations** — model each shop, kitchen, or warehouse as its own location.
- **Manage products & categories** — organize stock per location, with units and last-known quantities.
- **Run inventory sessions** — start a count for a location and work through products one by one.
- **Count together** — multiple team members can count the same session simultaneously, with live updates.
- **Control access** — admins decide which employees can access which locations.
- **History, export & import** — review past counts, export results, and bulk-import products from spreadsheets.

---

## Key features

- **Locations & products** — per-location categories and products with units and last-known quantity.
- **CSV / XLSX import** — bulk-load products from a spreadsheet (handles localized headers and decimal commas).
- **Inventory sessions** — one active counting session per location, with resume support.
- **Realtime collaborative counting** — teammates see each other's counts populate live.
- **Save & Next flow** — count a product and jump straight to the next uncounted one.
- **Replace / Add quantity flow** — choose how imported quantities merge into a location.
- **Partial-count warnings** — get warned before completing a session with uncounted products.
- **History grouped by month** — completed sessions organized for quick review.
- **CSV export** — includes previous/current quantity, difference, and *counted by* / *counted at* attribution.
- **Employee access requests** — employees can request access to specific locations.
- **Admin approval workflow** — admins approve or reject requests from the Profile screen.
- **Role- & location-based permissions** — enforced in the database, not just the UI.

---

## Tech stack

- **Expo / React Native** — native iOS & Android from one codebase
- **Expo Router** — file-based navigation
- **TypeScript**
- **Supabase Auth** — email/password authentication and sessions
- **Supabase Postgres** — relational data store
- **Row Level Security (RLS)** — per-company, per-location access enforced at the database
- **Supabase Realtime** — live counting across devices
- **Expo Document Picker** — file selection for imports
- **XLSX** — spreadsheet parsing

---

## Architecture highlights

- **RLS-enforced per-location access** — employees can read/write only data for locations they're
  assigned to; admins have full company-wide access. The UI mirrors this, but the database is the
  source of truth (defense in depth).
- **Admin vs employee roles** — admins manage setup and access; employees count within their
  assigned locations.
- **Services layer** — screens call thin async functions in `services/` that wrap Supabase queries
  and RPCs, keeping data access out of components.
- **Reusable components** — shared UI primitives and feature-scoped components under `components/`.
- **Phased migrations** — incremental, documented SQL migrations in `supabase/migrations/`.
- **QA checklist** — a manual smoke-test checklist covers the critical flows (see below).

---

## Screens / app areas

- **Auth & onboarding** — welcome, register (create a company), and join (via company code).
- **Locations** — list and manage locations (scoped to access).
- **Sessions** — start, resume, and review inventory sessions.
- **Counting screen** — checklist + numpad bottom sheet with realtime updates.
- **History** — completed sessions grouped by month.
- **Profile / Team management** — account details, team join code, employee access management, and access requests.
- **Import review** — preview and adjust mapped categories/products/quantities before committing.

---

## Local development

```bash
# Install dependencies
npm install

# Start the Expo dev server
npx expo start

# Type-check
npx tsc --noEmit
```

Create a `.env` file (see `.env.example`) with your Supabase project credentials:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

> Never commit real credentials. Only the public anon key belongs in the client.

---

## Database

- Migrations live in **`supabase/migrations/`** and are applied incrementally.
- **RLS policies are required** — the app's permission model depends on them.
- **Do not run the app against a database without applying migrations** — without the RLS policies
  and helper functions, access control will not behave correctly.

---

## QA

Critical flows are covered by a manual smoke-test checklist:

- **`docs/QA_CHECKLIST.md`**

Run through the relevant sections after changes to auth, permissions, sessions, imports, or RLS.

---

## Roadmap

Planned, not yet built:

- Monthly inventory mode
- PDF import
- Barcode scanning
- Analytics / variance reports
- Better realtime access-revocation UX
- Offline mode

---

## Status

**Active development — MVP+.** Stockly is functional and under active iteration; it is not yet a
production release.
</content>
