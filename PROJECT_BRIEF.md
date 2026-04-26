# Inventory Tracker — Project Brief

## Product
Mobile-first inventory counting app replacing paper stocktaking.
Wins if: faster than Excel, easier than paper, simpler than existing systems.

## Stack
- Expo (React Native) + Expo Router
- TypeScript
- Supabase (PostgreSQL + Auth + Realtime)

## Out of Scope (MVP)
Orders, suppliers, invoices, analytics, barcode scanning, web app, offline sync, complex permissions.

## Folder Structure
```
app/
  (auth)/         login, register
  (app)/          main authenticated screens
components/
  ui/             primitives (Button, Input, Sheet)
  inventory/      domain components
services/         supabase query functions
lib/              supabase client, utils
types/            shared TypeScript types
supabase/         SQL migrations
```

## Data Models
- companies { id, name }
- users { id, email }
- company_members { user_id, company_id, role: admin|employee }
- locations { id, company_id, name }
- categories { id, location_id, name }
- products { id, category_id, name, unit, last_known_quantity }
- inventory_sessions { id, location_id, created_at, status: active|completed }
- inventory_counts { id, session_id, product_id, quantity, updated_by, updated_at }

## Phases

### Phase 1 — Foundation
- Expo Router scaffold
- Supabase client setup
- Auth: login / register
- Basic navigation shell
- Supabase SQL schema

### Phase 2 — Product Setup
- Companies / locations CRUD
- Categories CRUD
- Products CRUD (name, unit, last_known_quantity)

### Phase 3 — Inventory Session
- Start session for a location
- Load products into session
- Session list + resume

### Phase 4 — Counting Experience
- Checklist screen (list view, no inputs)
- Bottom sheet per product (numeric input)
- Instant UI update on save
- Multi-user: show updated_by + timestamp

### Phase 5 — Export + Polish
- CSV/XLSX export
- Progress indicator (% complete)
- UX polish + real-device testing
