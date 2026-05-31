# Project Summary

**Generated:** 2026-05-31
**Source:** discovery pass over code, docs, and Supabase migrations. No code was changed.
**Naming note:** the repo/app is named *Inventory Tracker* (`package.json`, `app.json`,
`PROJECT_BRIEF.md`), but the docs and `README.md` brand it *Stockly*. These are the same product;
the name is not yet settled (see inconsistencies in `README_NOTES.md`).

---

## Product overview

A fast inventory counting tool for small teams — it replaces paper stocktakes and spreadsheets,
nothing more. The bet (from `PROJECT_BRIEF.md`): *faster than Excel, easier than paper, simpler
than existing systems.* Stockly is deliberately a **tool, not a management suite**: it is not an
ERP, warehouse management system, or analytics platform.

- **Core loop:** import or create products → run an inventory session → count together with the
  team → export results → come back next month and count again.
- **Primary value:** faster counting, less paperwork, easier collaboration, reliable history,
  simple exports.
- **Who it's for:** small businesses with one or more physical locations (e.g. shops, kitchens,
  storerooms) whose staff periodically count stock.
- **Two roles:** **admins** set up the company, locations, and products and control access;
  **employees** are granted specific locations and do the counting.
- **Platform:** native iOS/Android via Expo. No web app, no offline mode (both out of scope).

---

## Main workflows

1. **Onboarding / auth**
   - Register: creates a company → registrant becomes its **admin**; a company **join code** is
     auto-generated. A two-step screen collects company/name/email/password, then shows a plan
     picker (UI only — *billing is not enabled*).
   - Join: an employee signs up with a company **join code** (via the `join_company_by_code`
     security-definer RPC) → joins as **employee** with **no location access** until granted.
   - Auth/session handled by Supabase; the root layout redirects between `(auth)` and `(app)`
     based on session state. `useCompanyId` resolves company + role (with retry to absorb
     post-signup replication lag).

2. **Product setup (admin)** — create locations, categories, and products (name, unit,
   last-known quantity). Import products from CSV/XLSX/pasted text, or clone from another location.

3. **Inventory session lifecycle**
   - Start an **active** session for a location (one active session per location).
   - Count products via a numpad bottom-sheet; **Save** or **Save & Next** (advances to next
     uncounted product). Counts upsert per `(session, product)`.
   - **Realtime:** multiple users on the same session see each other's counts live; attribution
     shows who counted and when.
   - Finish → session marked **completed**; each counted product's `last_known_quantity` is
     updated. Empty active sessions can be **cancelled** (deleted).

4. **History & export** — completed sessions are grouped by month. Admins can **export CSV**
   (category, product, unit, previous/current qty, difference, counted-by, counted-at; UTF-8 BOM
   for Excel). Export is admin-only.

5. **Access-request flow** — an employee requests access to a location (from the Locations footer
   or Profile → My access). Admins see pending requests in Profile and **approve** (creates an
   assignment) or **reject**.

---

## Architecture overview

```
app/            Expo Router file-based routes
  (auth)/       welcome, login, register, join
  (app)/        authenticated area
    (tabs)/     Locations, Sessions, Profile
    locations/[locationId]/...     products + sessions + counting screen
    sessions/history.tsx           all-history
    employees/                     admin access management
components/      UI primitives (ui/) + domain components by feature folder
services/        thin async wrappers over Supabase queries/RPCs
lib/             supabase client, hooks (useCompanyId, useLocationAccess), parsers, helpers
types/           shared TS types
supabase/migrations/   incremental SQL (RLS lockdown phases)
constants/theme.ts     design tokens
```

- **Data access pattern:** screens call `services/*` functions; `services` talk to Supabase.
  No state-management library — local React state + a few hooks.
- **Permissions are enforced in two layers:** UI filtering (hooks like `useAssignedLocationIds`,
  route guard `useLocationAccessGuard`) **and** Postgres RLS (the real enforcement).
- **Realtime:** Supabase realtime channel on `inventory_counts` (migration 004).
- **Migrations are phased:** each one documents intent, prereqs, and a rollback. Note: the **base
  schema is not in the folder** — migrations start at 002 (and 018 is absent), so 001/018 were
  applied directly in Supabase.

---

## Database design (concepts, not columns)

- **companies** — tenant root; each has a unique auto-generated `join_code`.
- **company_members** — links a user to one company with a `role` (admin | employee). Unique per
  user (migration 002).
- **locations** — belong to a company; the unit of access control. Have an optional address.
- **categories** — belong to a location; group products.
- **products** — belong to a category; have name, unit, and `last_known_quantity`.
- **inventory_sessions** — a count run for a location; `status` active|completed, `created_by`.
- **inventory_counts** — one row per `(session, product)`; quantity + `updated_by` / `updated_at`.
- **employee_location_assignments** — which employee can access which location; supports
  permanent/temporary + `expires_at` (expiry is schema-only, no UI yet).
- **location_access_requests** — employee → location requests; status pending/approved/rejected/
  cancelled; one pending request per (user, location).
- **user_profiles** — public mirror of `auth.users` (display name + email) so the app can show
  names; kept in sync best-effort on signup/edit.

---

## Permissions / RLS model

Enforced by Postgres RLS using two security-definer helpers: `is_admin()` and
`can_access_location(loc)` (migration 010), plus `user_company_id()`.

- **Admins** — full read/write across their own company: all locations, categories, products,
  sessions, counts; manage assignments; approve/reject access requests; delete any session
  (including completed ones with counts); export.
- **Employees** — scoped to **assigned locations only**:
  - **Read** locations / categories / products / sessions / counts only for assigned locations
    (migrations 013–015).
  - **Write** counts and create/continue sessions only for assigned locations; created sessions
    must be owned (`created_by = auth.uid()`) for create (016, 019). Can import/create categories
    into assigned locations (020, 022).
  - **Delete** only an *empty active* session in an assigned location (cancel-a-mistake); admins
    can delete anything (021, recursion fix in 024).
  - Cannot update access requests (admin-only) but can create their own (023).
- **Cross-company isolation** — every policy is scoped by `user_company_id()`; no path surfaces
  another company's data.
- **Access-request approval** — `list_requestable_locations()` (security-definer) lets an
  unassigned employee see locations to request; approving inserts an assignment row.

---

## Key screens

- **Welcome / Login / Register / Join** — onboarding & auth.
- **Locations tab** — admin sees all; employee sees assigned only (+ request-access footer).
- **Location detail** — products grouped by category; product CRUD + import sheets (largest file).
- **Sessions tab** — active session card + latest history per accessible location.
- **Counting screen** — checklist + numpad sheet + realtime + finish/cancel/export (largest logic).
- **History** — completed sessions grouped by month.
- **Profile** — header, team join code, admin access-requests, employee "My access".
- **Employees** (admin) — per-employee location-access editor.

---

## Current feature set (built)

Company onboarding + join codes · admin/employee roles · per-location assignments · location &
product CRUD · CSV / XLSX / paste import (incl. Lithuanian headers, decimal-comma) · clone from
another location · realtime multi-user counting with Save & Next · session complete/cancel ·
last-known-quantity propagation · month-grouped history · admin CSV export · access-request flow ·
display-name onboarding · full RLS lockdown.

## Known future roadmap (from docs — not built)

All planned work keeps Stockly a focused counting tool. Items below are the backlog discovered in
the codebase/docs; they map onto the phased roadmap in `README.md` (Stabilization → Core inventory
improvements → Future possibilities). Out-of-scope directions — barcode scanning, analytics /
variance reports, and offline mode — are intentionally **not** on the roadmap.

- PDF import (placeholder only)
- Monthly inventory mode + history filtering (location/month/mode)
- Counting workflow improvements & mobile UX polish
- Export improvements
- Realtime access-revocation UX (toast/redirect mid-session)
- Temporary-access expiration UI (schema supports `expires_at`)
- Employee category management (rename/delete) — currently admin-only
- Backfill for legacy null `created_by` sessions
- Push / email notifications on access requests
- Localized UI strings (currently English-only; importer accepts Lithuanian)
- Billing/plan enforcement (plan picker is UI-only today)
- Future possibilities (Phase 3): web dashboard, reports, business insights
</content>
