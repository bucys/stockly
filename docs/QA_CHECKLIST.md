# Stockly — QA / Smoke-Test Checklist

**Generated:** 2026-05-11
**App state:** RLS lockdown complete through phase 9 (locations, categories, products, sessions, counts, sessions delete, access requests). Profile redesign + Save & Next counting + History screen + Access requests v1 + display-name onboarding all shipped. Pending bigger items tracked in §9.

Run through each section on a clean install (or after `Sign out` + re-login). When testing employee flows, use an admin account in a second device/sim to drive assignments and approvals in real time.

---

## 1. Authentication

- [ ] Register a brand-new company with company name, your name, email, password
- [ ] "Please enter your name" alert blocks empty name
- [ ] "Missing fields" alert blocks other empty fields
- [ ] Weak-password alert blocks <6 chars
- [ ] After register, login works and Profile → Account details shows the entered display name
- [ ] Join existing company via valid join code + name; lands on Locations tab
- [ ] Invalid join code → user-friendly error
- [ ] Already-member join code → no duplicate row, lands on app
- [ ] Sign out clears session and routes back to welcome/login
- [ ] Re-login restores company membership without "Account setup incomplete" flash
- [ ] Cold start on slow network: spinner persists until membership resolved, never shows partial UI

---

## 2. Admin permissions

- [ ] Locations tab lists every company location
- [ ] Can create / edit / delete a location (incl. cascade warning when active session exists)
- [ ] Can open any location's products screen and add/edit/delete products
- [ ] Can CSV/XLSX import into any location
- [ ] Profile → Access requests section appears only when pending requests exist
- [ ] Approve creates an `employee_location_assignments` row + request flips to approved
- [ ] Reject flips request to rejected, no assignment created
- [ ] All history screen lists completed sessions across every location
- [ ] Per-location history opens via "View all history" on a location's sessions screen
- [ ] Completed session screen shows "Export CSV" button for admin only
- [ ] Export CSV downloads with `Counted by` / `Counted at` columns populated
- [ ] Admin can delete a completed session with counts (RLS 021)
- [ ] Admin can cancel/delete an empty active session

---

## 3. Employee permissions

### Assigned employee
- [ ] Locations tab shows only assigned locations
- [ ] Sessions tab shows only assigned-location sessions (active + latest completed)
- [ ] Profile → My access lists assigned location names (up to 3 + "+N more")
- [ ] Can start a session on an assigned location
- [ ] Can save counts with the numpad; Save and Save & Next both work
- [ ] Save & Next moves to next uncounted product; "Reached end of session" alert fires after last
- [ ] Can continue a session another teammate started
- [ ] Can edit a count entered by a teammate; `updated_by` flips to self
- [ ] Cannot open `/locations/:id/...` for an unassigned location (guard alerts + back)
- [ ] Request access link visible at bottom of populated Locations tab and inside Profile → My access

### Unassigned employee
- [ ] Locations tab shows "No locations assigned" empty state with pending-count hint when applicable
- [ ] Profile → My access shows "No locations assigned" + Request access row
- [ ] Sessions tab shows global empty state
- [ ] All history opens to "No history yet"
- [ ] Direct API/Supabase calls for unassigned data return empty (RLS verified)

---

## 4. Sessions

- [ ] Start session disabled when an active session already exists
- [ ] Numpad input validates non-negative number; rejects `.` as final char
- [ ] Save (no advance) writes count and closes modal
- [ ] Save & Next preserves modal, prefills next product
- [ ] Realtime: open same session on two devices → second device sees counts populate live
- [ ] Realtime: edit on one device updates "Current: X" label on the other without closing the modal
- [ ] Finish session with all counted → normal "Complete session?" prompt
- [ ] Finish session with some uncounted → "Some products were not counted" warning, Complete anyway proceeds
- [ ] Finish session with zero counted → "No products counted" prompt, Cancel session removes the row, no completion
- [ ] Cancel session (active, no counts) → row deleted, no 42P17 recursion
- [ ] Cancel session as employee (with counts) → blocked with admin-only message
- [ ] History screen groups completed sessions by month, shows location/date/counted total/last counted by
- [ ] Tapping a history row opens the completed session screen
- [ ] CSV export from completed session includes Counted by and Counted at; uncounted rows leave both blank

---

## 5. Products & imports

- [ ] Add product manually → appears in correct category
- [ ] Edit product (name, unit, category, last_known_quantity)
- [ ] Delete product (admin)
- [ ] CSV import: choose file, review sheet shows category/product/unit/qty mapping
- [ ] CSV with Lithuanian headers (`Produkto pavadinimas`, `Kategorija`, `Vienetas`, `Kiekis`) maps correctly
- [ ] CSV with leading/trailing empty columns auto-trims
- [ ] Decimal-comma quantities parse to floats
- [ ] XLSX import (first sheet) follows same mapping
- [ ] Importing a new category name creates the category for an employee in an assigned location (RLS 022)
- [ ] Employee cannot import into an unassigned location
- [ ] Duplicate product names in same category collapse / warn per existing review logic

---

## 6. Access requests

- [ ] Employee submits a request from Profile → My access → Request access
- [ ] Employee submits a request from Locations tab footer "Need another location?"
- [ ] Already-assigned locations are hidden from the picker
- [ ] Locations with existing pending requests appear as "Pending" and are disabled
- [ ] Duplicate submission via API returns the friendly "already pending" alert
- [ ] Optional reason field accepted; null reason allowed
- [ ] Admin sees the request appear in Profile → Access requests after refresh/focus
- [ ] Approve → assignment row created; employee sees the new location after re-fetch / app restart
- [ ] Reject → request disappears from admin; no assignment side-effect
- [ ] "You're already assigned to all locations." empty state shows when nothing requestable

---

## 7. UI / polish

- [ ] No "Rendered fewer hooks than expected" warnings in dev console on any screen
- [ ] All history shows spinner until role + access resolve (no flicker of unfiltered sessions)
- [ ] Locations tab loading spinner shown while assignedIds resolves
- [ ] Counting screen scroll padding lets last category clear the Finish footer (active + completed)
- [ ] Safe-area bottom respected on devices with home indicator
- [ ] Profile screen header (avatar + name + email + role pill) renders cleanly for short and long names
- [ ] Sign out divider feels intentionally separated (not glued to last group)
- [ ] Request access sheet: tighter rows, subtle selected tint, Cancel as ghost text
- [ ] Employees screen: back label reads "Profile", not "(tabs)"
- [ ] Employees screen: staged Save & Cancel flow works; Remove access destructive confirm appears on removals
- [ ] No raw email shown when display_name exists (attribution lines use displayUser)
- [ ] Markdown link routes (`router.push('/sessions/history')`) navigate without warnings

---

## 8. Security / RLS

- [ ] Employee deep-link to `/locations/:unassignedId/...` → guard alerts and routes back
- [ ] Employee deep-link to `/sessions/history?locationId=<unassigned>` → renders "No access" empty state, no flash
- [ ] Direct Supabase SELECT as employee on unassigned locations/sessions/counts/products returns []
- [ ] Direct INSERT/UPDATE as employee against unassigned data rejected by RLS
- [ ] `cancelSession` on empty active session as employee succeeds (migration 024 helper)
- [ ] Admin SELECT on `user_profiles` returns same-company rows (migration 012)
- [ ] Employee SELECT on same-company `user_profiles` returns teammate rows (migration 017)
- [ ] `list_requestable_locations()` RPC returns full company list for any authenticated company member
- [ ] No path through the app surfaces another company's data

---

## 9. Known future improvements (not blocking ship)

- [ ] PDF import — still placeholder in the file-import sheet
- [ ] Monthly inventory mode / history filters by location, month, mode (`_FutureFilters` shape already drafted in `sessions/history.tsx`)
- [ ] Temporary access expiration UI (`employee_location_assignments.expires_at` already supported in schema, no admin UI yet)
- [ ] Realtime revocation UX — toast/redirect when admin removes access mid-session
- [ ] Categories employee-management phase (rename/delete employee policies) — currently admin-only
- [ ] History full-text search / filter input
- [ ] Backfill for legacy null `created_by` sessions (attribution falls back to "Team member")
- [ ] Display name self-edit moved out of Profile modal into inline settings row (optional refinement)
- [ ] Push / email notifications on access requests
- [ ] Localized strings — UI currently English-only; importer accepts Lithuanian headers
