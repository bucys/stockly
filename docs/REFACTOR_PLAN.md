# Stockly — Refactor Plan

**Generated:** 2026-05-11
**Status:** Production-cleanup audit. App behavior MUST stay unchanged through each step. Take one row at a time; never combine.

---

## Cleanup already applied in this pass

- Removed all `console.log` breadcrumbs from `services/sessions.ts`, `services/auth.ts`, `services/locations.ts`, `services/import.ts`, `app/_layout.tsx`, and `app/(app)/locations/[locationId]/sessions/[sessionId].tsx`. `console.warn` is kept for non-fatal anomalies (best-effort writes, realtime channel errors); `console.error` is kept only where it carries unique diagnostic value the user wouldn't see otherwise.
- No unused imports detected by `tsc --noEmit`.
- No logic, RLS, or UI behavior changed.

`tsc --noEmit` clean after this pass.

---

## Biggest files (target shortlist)

| File | Lines | Notes |
|---|---|---|
| `app/(app)/locations/[locationId]/index.tsx` | 1467 | Products screen + 6 modals (new/edit product, import-source picker, import-file menu, paste sheet, review wiring) all inline |
| `app/(app)/locations/[locationId]/sessions/[sessionId].tsx` | 1259 | Counting screen + numpad sheet + realtime subscription + export pipeline + cancel/complete prompts inline |
| `app/(app)/(tabs)/profile.tsx` | 725 | Header + 4 admin sections + display-name modal + access-request rows inline |
| `app/(app)/(tabs)/sessions.tsx` | 630 | Active sessions + history + start/continue handlers + custom row styles |
| `app/(app)/locations/[locationId]/sessions/index.tsx` | 550 | Sessions list + active card + completed summary + cancel flow inline |
| `app/(app)/(tabs)/index.tsx` | 475 | Location list + new-location modal + request-access wiring inline |
| `app/(app)/employees/index.tsx` | 425 | Employees list + assignment editor modal inline |
| `components/inventory/ImportReviewSheet.tsx` | 389 | Review header + per-row form + warnings inline |
| `app/(app)/sessions/history.tsx` | 346 | History list + month grouping + empty state inline |

---

## Proposed shared UI primitives

These don't exist yet. Build them lazily as the screens below ask for them — do not pre-extract.

| Component | Where it would replace duplication |
|---|---|
| `components/ui/ListRow` | Profile rows, Employees rows, History rows, Settings-style nav rows in Locations / Sessions tabs |
| `components/ui/GroupedCard` | Profile group, Request access list, Employees screen, History month group |
| `components/ui/SectionHeader` | "Profile", "Team join code", "Access requests", "My access", history month labels |
| `components/ui/Badge` | COMPLETE badge, NEW category pill, role pill, "Pending" tag |
| `components/ui/EmptyState` | "No history yet", "No employees yet", "No locations assigned", "No products counted" |
| `components/layout/KeyboardSafeView` (exists) | Future non-modal form screens |

Each, once introduced, is mechanically applied row-by-row. Don't change visual output unless the spec says so.

---

## Refactor candidates

### 1 · Location detail screen (`locations/[locationId]/index.tsx`, 1467)

**Problem:** five modals, two list renderers, import-flow plumbing, and a 600-line stylesheet all in one file.

**Suggested extraction order**
1. `components/inventory/ProductEditorSheet.tsx` — new/edit product modal (state + validation + save handler).
2. `components/inventory/ImportFileSheet.tsx` — the "Import from file" Choose-CSV/XLSX/PDF menu (with the existing kind-validation + try/catch).
3. `components/inventory/ImportSourceSheet.tsx` — the existing import-from-location flow (source picker + category selection + mode toggle).
4. `components/inventory/PasteImportSheet.tsx` — paste-text review entry.
5. `components/inventory/ProductRow.tsx` + `CategoryHeader.tsx` — list row + section header.

**Risk:** medium. The screen ties many pieces together; extract one sheet at a time and verify each manually before continuing.

---

### 2 · Counting screen (`sessions/[sessionId].tsx`, 1259)

**Problem:** screen + Numpad sheet + realtime + export + cancel/complete dialogs all share state.

**Suggested extraction order**
1. `components/sessions/CountingFooter.tsx` — Finish / Cancel / Export footer block (already condition-branched).
2. `components/sessions/CountingToolbar.tsx` — search input + filter chips + Next button.
3. `components/sessions/NumpadSheet.tsx` — numpad UI (already nearly standalone).
4. `lib/exportSession.ts` — `handleExport` body (rows → CSV → cache file → Sharing call) lifted into a pure helper.
5. `lib/sessionRealtime.ts` — channel subscription hook returning the same setSections/setCountsMap/setSelected updaters as a callback.

**Risk:** medium-high — realtime + optimistic updates have subtle ordering. Pull the export helper first (zero state coupling), then the footer, then anything touching `selected`.

---

### 3 · Profile screen (`profile.tsx`, 725)

**Problem:** four admin sections + display-name modal + access-request rows all inline.

**Suggested extraction order**
1. `components/profile/ProfileHeader.tsx` — avatar/name/email/role pill.
2. `components/profile/AccessRequestRow.tsx` — pending request row (already a single, well-bounded JSX block).
3. `components/profile/EditDisplayNameSheet.tsx` — display-name modal.
4. `components/profile/MyAccessSection.tsx` — employee-only "My access" block.

**Risk:** low. Sections have minimal cross-coupling beyond `loadAdminData` / `profilesByUserId`. Extractions can be one-by-one.

---

### 4 · Sessions tab (`(tabs)/sessions.tsx`, 630)

**Problem:** active-session card + latest-completed history + start handler + filter logic + custom row styles.

**Suggested extraction order**
1. `components/sessions/ActiveSessionCard.tsx` — single active card.
2. `components/sessions/HistoryRow.tsx` — shared with `sessions/history.tsx` (deduplicates a near-identical row).
3. `lib/sessionsTabData.ts` — the `load` callback's data assembly (active + history with attribution).

**Risk:** medium. The data-assembly extraction is the one to watch; the row components are mechanical.

---

### 5 · Location sessions screen (`locations/[locationId]/sessions/index.tsx`, 550)

**Problem:** parallel structure to the Sessions tab — active card + completed summary + cancel flow.

**Suggested extraction order**
1. Reuse `ActiveSessionCard` + `HistoryRow` from §4.
2. Lift `handleCancel` (currently inline, identical to the counting-screen version) into `services/sessions.ts` or `lib/cancelSession.ts`.

**Risk:** low after §4 is done.

---

### 6 · Locations tab (`(tabs)/index.tsx`, 475)

**Problem:** location card + new/edit location modal + request-access wiring inline. Otherwise healthy.

**Suggested extraction order**
1. `components/locations/LocationCard.tsx` — single card.
2. `components/locations/LocationEditorSheet.tsx` — new/edit modal.

**Risk:** low.

---

### 7 · Employees screen (`employees/index.tsx`, 425)

**Problem:** staged-edit modal logic + row layout in one file.

**Suggested extraction order**
1. `components/employees/EmployeeRow.tsx`.
2. `components/employees/LocationAccessSheet.tsx` — the staged Save / Cancel modal.

**Risk:** low.

---

### 8 · Import review (`components/inventory/ImportReviewSheet.tsx`, 389)

**Problem:** header + summary + toggle + per-row form + warnings + footer all inline. Per-row form is the heavy bit at scale (100+ rows).

**Suggested extraction order**
1. `components/inventory/ImportReviewRow.tsx` — row JSX + per-field edit handlers (pure presentational, takes `DraftState` + `onChange` + `onToggle`).
2. `components/inventory/ImportSummaryBar.tsx` — top summary + toggle card.

**Risk:** low. The matching/validation logic stays in `lib/importMatchers.ts`.

---

### 9 · History (`sessions/history.tsx`, 346)

**Problem:** month grouping + row JSX + empty/locked-out branches inline.

**Suggested extraction order**
1. Share `HistoryRow` with §4.
2. `lib/groupSessionsByMonth.ts` — pure helper for the `MonthGroup` derivation.

**Risk:** low.

---

## Recommended order

Go in the order **most-shared-primitive-first → biggest-file-second**, so each later extraction has the building blocks it needs.

1. **§3 ProfileHeader / AccessRequestRow / EditDisplayNameSheet** — low risk, exercises the row + grouped-card pattern.
2. **§4 ActiveSessionCard + HistoryRow** — these unlock §5 and §9 deduplication.
3. **§9 sessions/history split (uses HistoryRow + month helper)**.
4. **§5 location sessions screen (uses §4 components)**.
5. **§7 Employees split**.
6. **§6 Locations tab split**.
7. **§8 Import review row extraction** — biggest win for large imports.
8. **§2 Counting screen** — export helper first, then toolbar, then numpad, then realtime hook last.
9. **§1 Location detail screen** — biggest file, but with everything above in place this becomes mechanical.

Stop after any step that introduces uncertainty; run `tsc --noEmit` + manually walk the [QA checklist](QA_CHECKLIST.md) sections relevant to the changed screen before continuing.
