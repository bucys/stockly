# Branding Audit — Stockly

**Generated:** 2026-05-31
**Goal:** ensure the product is consistently branded *Stockly* in user-facing surfaces, without
touching identifiers (bundle IDs, package names, slug, deep-link scheme) or app logic.

---

## Summary

The app's **visible** branding was already mostly Stockly — the welcome screen renders the
"Stockly" wordmark and tagline. The only user-facing mismatch was the Expo **app display name**
in `app.json`, now fixed. All remaining "Inventory Tracker" strings are **technical identifiers**
or **internal references** and were intentionally left unchanged (changing them risks breaking
Expo builds, deep links, or the existing Supabase/EAS project association).

---

## Changes applied (user-facing)

| Location | Current value (before) | New value | Reason |
|---|---|---|---|
| `app.json` → `expo.name` | `Inventory Tracker` | `Stockly` | App display name (home-screen label, app switcher, splash) — clearly user-facing |
| `PROJECT_BRIEF.md` (H1) | `# Inventory Tracker — Project Brief` | `# Stockly — Project Brief` | Internal doc heading; brand title, zero runtime impact |

Already correct (no change needed):

| Location | Value | Note |
|---|---|---|
| `app/(auth)/welcome.tsx` | `Stockly` | Wordmark shown on the welcome screen |
| `README.md`, `docs/QA_CHECKLIST.md`, `docs/REFACTOR_PLAN.md` | `Stockly` | Already branded Stockly |

---

## Intentionally NOT changed (identifiers — require explicit decision)

These are technical identifiers. Changing them can break Expo/EAS builds, OTA updates, deep
links, store listings, and any existing Supabase redirect config. Listed here for an explicit
go/no-go; left as-is for now.

| Location | Current value | Recommended value (if rebranding fully) | Risk if changed |
|---|---|---|---|
| `app.json` → `expo.slug` | `inventory-tracker` | `stockly` | Ties to the EAS/Expo project; changing breaks build/update continuity |
| `app.json` → `expo.scheme` | `inventorytracker` | `stockly` | Deep-link scheme; breaks any saved OAuth/magic-link redirects |
| `app.json` → `ios.bundleIdentifier` | `com.inventorytracker.app` | `com.stockly.app` (or your org) | App Store identity; new ID = new app record |
| `app.json` → `android.package` | `com.inventorytracker.app` | `com.stockly.app` (or your org) | Play Store identity; new package = new app record |
| `package.json` → `name` | `inventory-tracker` | `stockly` | npm package name only (private); cosmetic, low risk but unnecessary |

**Recommendation:** keep these as-is until you're ready to commit to a single launch identity.
If/when you rebrand the identifiers, do it as one deliberate change and update Supabase auth
redirect URLs + any EAS project config in the same pass.

---

## Other references (no action — historical/non-branding)

| Location | Value | Why left alone |
|---|---|---|
| `.claude/settings.local.json` | `/Users/.../inventory-tracker/` paths | Local tool permission history; absolute filesystem paths, not branding |
| Repo folder name `inventory-tracker/` | — | Filesystem path; renaming is optional and outside app scope |
| `docs/PROJECT_SUMMARY.md`, `docs/README_NOTES.md` | mention "Inventory Tracker" | Audit/analysis docs that *describe* the naming gap; references are intentional |

---

## Remaining old-name references (full list)

After the changes above, "Inventory Tracker"/`inventory-tracker`/`inventorytracker` still appears
only in:

- `app.json`: `slug`, `scheme`, `ios.bundleIdentifier`, `android.package` (identifiers — see table)
- `package.json`: `name` (private npm name)
- `.claude/settings.local.json`: historical command paths
- `docs/PROJECT_SUMMARY.md`, `docs/README_NOTES.md`: analysis references
- The repository directory name

No user-facing screen, title, or branding string still uses the old name.

---

## Expo build impact

- The applied change (`expo.name`) **only affects the display name** and is build-safe.
- **No identifier was changed**, so EAS builds, the deep-link scheme, and store associations are
  unaffected.
- `app.json` and `package.json` are **not fully aligned by design**: `app.json` now shows the
  user-facing name *Stockly*, while both files keep the original `inventory-tracker` *identifiers*.
  This is the recommended state until a deliberate identifier rebrand is approved.

---

## Alignment status

- **User-facing branding:** ✅ consistent — *Stockly* everywhere visible.
- **Identifiers (slug / scheme / bundle / package / npm name):** ⏸ still `inventory-tracker` —
  intentionally unchanged, pending explicit decision.
</content>
