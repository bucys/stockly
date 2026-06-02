# Auth & security setup

This document covers the auth hardening and the employee-invite system, and the
**manual Supabase dashboard steps** that the code cannot configure on its own.

## Roles & sign-in

| Role     | Sign-in                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Admin    | Email + password (registration creates the company).                    |
| Employee | Invited by an admin → email **one-time code (OTP)** → set name + password. |

The legacy **join-code** flow still works alongside invitations; nothing was
removed.

## 1. Apply the migrations

```bash
supabase db push      # or run the SQL in supabase/migrations/ in order
```

New/changed in this work:

- `025_companies_update_admin_only.sql` — company UPDATE is admin-only.
- `026_companies_insert_policy.sql` — documents the companies INSERT policy.
- `027_employee_invitations.sql` — invitations tables + `accept_invitation()`.

## 2. Deploy the Edge Function

The invite step needs the **service_role** key, which must never ship in the
app. It lives only in this server-side function.

```bash
supabase functions deploy invite-employee
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
auto-injected on deployed functions. For local `supabase functions serve`, set
them in `supabase/.env` (never commit that file).

## 3. Dashboard settings (must be done by hand)

These cannot be set from code. In the Supabase dashboard:

### Authentication → Providers → Email
- **Enable Email provider.**
- Turn on **"Email OTP"** (so invited employees receive a 6-digit code rather
  than only a magic link).
- Keep **"Confirm email"** on.

### Authentication → Policies / Passwords
- **Minimum password length: 8** (matches `MIN_PASSWORD_LENGTH` in
  `lib/passwordStrength.ts`). This is the authoritative server-side check; the
  in-app strength meter is UX only.
- **Enable "Leaked password protection" (HaveIBeenPwned).** This rejects
  passwords found in known breaches. ← the breach check you asked for.
- (Optional) Set **"Password requirements"** to *lowercase, uppercase, digits &
  symbols* to mirror the in-app policy on the server.

> Existing accounts with older/weaker passwords are **not** forced to change and
> can still sign in — these checks apply only when a password is newly set
> (registration, invite onboarding, future reset).

### Authentication → Email Templates → Invite user
- Customize the **"Invite user"** template to tell the employee:
  *"Open the Stockly app, choose 'Were you invited? Continue with email', and
  sign in with your email to get a one-time code."*

### Authentication → Rate limits
- Review the email send / OTP verification rate limits — the defaults are a
  reasonable brute-force guard for the OTP step.

## 4. Flow reference

**Admin invites:** Employees screen → *Invite employee* → email + locations →
`invite-employee` function verifies the admin, provisions/emails the user, and
records the pending invite.

**Employee accepts:** Welcome → *Continue with email* → enter email → 6-digit
code → `accept_invitation()` creates membership + the pre-assigned locations →
set name + strong password.

## 5. Still recommended (not yet implemented)

- Rate-limit / lengthen the legacy `join_company_by_code` codes (32-bit today).
- Consider deep-linkable invite acceptance once the app ships to TestFlight/store
  (currently OTP-code entry, which works in Expo Go).
