# README Notes — Planning Doc (not the README itself)

**Generated:** 2026-05-31
Purpose: decide what the public GitHub README should and shouldn't contain, based on the
discovery pass in `PROJECT_SUMMARY.md`. The final README is **not** written yet.

---

## What should DEFINITELY appear in the README

- **One-line description:** mobile-first inventory counting app (Expo + Supabase) that replaces
  paper/spreadsheet stocktaking.
- **Tech stack:** Expo (React Native), Expo Router, TypeScript, Supabase (Postgres + Auth +
  Realtime), `xlsx` for spreadsheet parsing.
- **Core features** (factual, from the summary's "Current feature set"): company + join-code
  onboarding, role-based access (admin/employee), per-location assignments, product CRUD,
  CSV/XLSX/paste import, multi-user realtime counting with Save & Next, session history, CSV
  export, access-request flow.
- **Architecture at a glance:** file-based routes under `app/`, thin `services/` over Supabase,
  RLS-enforced permissions (link to migrations). A short tree helps.
- **Permissions model:** brief admin vs employee table — it's a genuine differentiator and is
  enforced at the DB level (defense in depth).
- **Local setup:** prerequisites (Node, Expo), `npm install`, copy `.env.example` → `.env` with
  `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then `npm start` / `npm run ios` /
  `npm run android`.
- **Supabase setup caveat:** migrations cover the RLS lockdown phases but the **base schema
  (001/018) must be created separately** — flag this honestly so a cloner isn't stranded.
- **Project status:** describe as a **work-in-progress / MVP**, not production.
- **Roadmap:** the "Known future roadmap" items (clearly labeled "planned / not yet built").
- **Decide the name first:** Stockly vs Inventory Tracker — use one consistently.

## What should NOT appear

- **Real pricing / plans as if they're live.** The plan picker is UI-only and billing is
  disabled (`register.tsx` literally renders "Billing is not enabled yet."). Don't present
  Free/Pro/Pro Annual as purchasable.
- **Production / "live" / "available on the App Store" claims** — no evidence of a release.
- **Invented metrics** — no user counts, uptime, performance numbers, or testimonials.
- **PDF import** as a feature — it's a placeholder.
- **XLSX *export*** — only CSV export exists (XLSX is import-only).
- **Temporary-access / expiring-access** as a usable feature — schema-only, no UI.
- **Screenshots or demo links that don't exist yet** (see below).
- **Barcode scanning, offline sync, analytics, orders/suppliers** — explicitly out of scope.
- **Secrets** — never commit real Supabase URL/keys; reference `.env.example` only.

---

## Missing information needed for screenshots / demo

None of the following exist in the repo today — they must be produced or supplied:

- **Screenshots / screen recording** of: onboarding, Locations tab, the counting screen + numpad,
  session history, and the admin access-requests view. (No `assets/screenshots/` exists; only app
  icons/splash are present under `assets/`.)
- **A short demo GIF** of multi-user realtime counting (the standout feature) — needs two
  simulators/devices.
- **Demo / TestFlight / Expo Go link** — none exists; decide whether to provide one or omit.
- **A seeded demo company + join code** for reviewers to try, or a clear "bring your own Supabase"
  note instead.
- **Logo / brand wordmark** once the Stockly vs Inventory Tracker name is settled.
- **License** — no `LICENSE` file in the repo; pick one (or state "all rights reserved").

---

## Suggested README structure (for when we write it)

1. Title + one-line tagline (+ logo)
2. Status badge / "MVP — work in progress"
3. Short overview paragraph
4. Screenshots / demo GIF
5. Features (bulleted, factual)
6. Tech stack
7. Architecture overview (tree + 2–3 sentences)
8. Permissions model (admin vs employee table)
9. Getting started (prereqs, env, install, run) + Supabase schema caveat
10. Roadmap (planned, clearly labeled)
11. Project structure reference
12. License

---

## Inconsistencies found (docs vs code)

- **Name:** *Inventory Tracker* (package.json / app.json / PROJECT_BRIEF) vs *Stockly* (docs /
  README). Pick one before publishing.
- **Data model drift:** `PROJECT_BRIEF.md` lists a `users` table; the app actually uses Supabase
  `auth.users` + a `user_profiles` mirror. The brief also predates `employee_location_assignments`,
  `location_access_requests`, `join_code`, and `created_by`.
- **"Simple permissions" out-of-scope note** in the brief is now outdated — a full per-location
  RLS model with access requests shipped.
- **Missing migrations:** the folder starts at `002` and skips `018`; the base schema and one
  phase were applied outside version control. Worth reconciling for reproducibility.
- **Plan picker vs scope:** pricing tiers exist in the UI but billing is explicitly disabled —
  not a contradiction, but easy to misread as a live feature.
</content>
