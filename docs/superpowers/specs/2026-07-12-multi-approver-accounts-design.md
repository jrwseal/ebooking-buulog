# Multi-approver accounts with admin management

## Problem

Approver access is currently a single shared PIN stored in plaintext in the
`settings` table (`approver_pin`, default `123456`). Anyone with the PIN
looks identical to every other approver — there is no way to tell who
approved what, and revoking one person's access means changing the PIN for
everyone.

## Goals

- Multiple named approver accounts, each with its own username/password.
- One account flagged as **admin**, who can create, delete, and
  enable/disable any approver account (including other admins).
- Session persists across page reload (no re-login on every refresh).
- Any logged-in approver (including admin) can change their own password.

## Non-goals

- Real backend auth (Supabase Auth / JWT sessions). Explicitly declined —
  this stays a client-side check against a Supabase table via the anon key,
  matching the trust model the existing PIN system already uses and that
  `schema.sql` documents as an accepted risk for an internal tool.
- Per-booking "approved by" attribution — out of scope for this change.
- Self-service signup or "forgot password" flow — admin resets manually by
  editing the account (delete + recreate, or a future reset action).

## Data model

New table `approvers`, replacing `settings.approver_pin`:

```sql
create table if not exists approvers (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  salt          text not null,
  display_name  text not null,
  is_admin      boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz default now()
);
```

- `password_hash` = `hex(SHA-256(salt + password))`, computed client-side
  with Web Crypto (`crypto.subtle.digest`). `salt` is a random 16-byte hex
  string generated client-side (`crypto.getRandomValues`) whenever a
  password is set or changed.
- `is_admin` is a flag on an approver row, not a separate role tier — an
  admin is an approver who can additionally manage accounts.
- `active=false` blocks login without deleting the row (so an admin can
  re-enable later).
- The `settings` table stays as-is (unused by auth going forward, kept for
  any future key/value config); `approver_pin` is no longer read or written
  anywhere in the app.

RLS: same trust model as the existing `settings` policy — `select`/`insert`/
`update`/`delete` all allowed via anon key, with the same risk-accepted
comment carried over from the PIN implementation. Real protection would
require Supabase Auth, which was explicitly declined for this pass.

### Seed data

`schema.sql` inserts one default admin so there's a way to log in after a
fresh deploy:

```sql
create extension if not exists pgcrypto;

insert into approvers (username, password_hash, salt, display_name, is_admin, active)
values (
  'admin',
  encode(digest('seed-salt-0001' || 'changeme123', 'sha256'), 'hex'),
  'seed-salt-0001',
  'ผู้ดูแลระบบ',
  true,
  true
)
on conflict (username) do nothing;
```

`encode(digest(x, 'sha256'), 'hex')` in Postgres and
`crypto.subtle.digest('SHA-256', utf8Bytes(x))` → hex in the browser produce
the same hash for the same UTF-8 input, so this seed row verifies correctly
against the client-side login check. Default password `changeme123` must be
changed via the app immediately after the first deploy — call this out in
the schema file comment.

## App changes

### `src/lib/auth/hash.ts` (new)

Small helper module:
- `randomSalt(): string` — 16 random bytes, hex-encoded.
- `hashPassword(password: string, salt: string): Promise<string>` — SHA-256
  hex digest of `salt + password` via `crypto.subtle`.

### `src/types/index.ts`

```ts
export interface Approver {
  id: string
  username: string
  passwordHash: string
  salt: string
  displayName: string
  isAdmin: boolean
  active: boolean
}
```

### `src/store/useStore.ts`

- Remove `pin` state, `fetchPin`, `changePin` (and their `settings` table
  calls).
- Add `approvers: Approver[]` state + `fetchApprovers()` (mirrors
  `fetchRooms`).
- Add `addApprover(username, displayName, password, isAdmin)`: generates
  salt, hashes password, inserts row.
- Add `removeApprover(id)`.
- Add `setApproverActive(id, active)`.
- Add `changeOwnPassword(id, currentPassword, newPassword)`: re-fetches the
  row, verifies `hashPassword(currentPassword, storedSalt) === storedHash`,
  generates a fresh salt, writes new hash. Throws on mismatch so the caller
  can show an error.

### `src/App.tsx`

- On mount, after `fetchApprovers()` resolves, read
  `localStorage['ebooking_approver_session']` (`{username, isAdmin}` JSON).
  If the username still exists in `approvers` and `active === true`, restore
  `authed=true`, `role='approver'`, and local `currentApprover` state
  (`{username, displayName, isAdmin}`). Otherwise clear the stored session.
- `tryLogin(username, password)`: find approver by username, check
  `active`, hash the entered password with the stored salt, compare. On
  success, set state as above and write the session to localStorage. On
  failure, generic "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" error (don't reveal
  which field was wrong).
- `logout()`: clears `authed`, `role`, `currentApprover`, and the
  localStorage session key.
- New toolbar button "บัญชี" (`Users` icon), visible only when
  `role === 'approver' && authed && currentApprover?.isAdmin`, opens
  `AccountManagerModal`.
- "รหัสผ่าน" button stays, now opens the repurposed self password-change
  modal wired to `changeOwnPassword` using `currentApprover.id`.

### `src/components/modals/LoginModal.tsx` (extracted from inline `App.tsx`)

Two fields — username (text) and password (password) — instead of the
single PIN field. Same modal chrome/pattern as today.

### `src/components/modals/AccountManagerModal.tsx` (new)

Same structural pattern as `RoomManagerModal.tsx`:
- List of approvers: username, display name, admin badge if `is_admin`,
  active/inactive toggle switch, delete button (with the same
  click-again-to-confirm pattern `RoomManagerModal` uses).
- Add form: username, display name, password, "เป็นแอดมิน" checkbox.
- Guard rails: can't delete or deactivate your own account (prevents an
  admin locking themselves out); if this would remove the last active
  admin, block it with an inline error.

### `src/components/modals/ChangePinModal.tsx` → repurposed

Same two-field UI (current password, new password), but `onSubmit` now
calls `changeOwnPassword` instead of the old settings-table `changePin`.
Rename file/component to `ChangePasswordModal` for clarity.

## Error handling

- Login failure: single generic message, no distinction between "user not
  found" and "wrong password".
- Deactivated account trying to log in: same generic message (don't leak
  account existence/status).
- Duplicate username on create: inline form error before hitting the DB
  (client-side check against loaded `approvers` list), plus DB unique
  constraint as backstop.
- Wrong current password on self password-change: inline error, no state
  change.

## Testing

- Manual verification pass (per project convention — no test suite in this
  repo): seed admin can log in, create a second approver, log in as that
  approver, confirm the "บัญชี" button is hidden for non-admins, deactivate
  the second approver and confirm they're logged out / blocked on next
  login attempt, change-own-password flow round-trips correctly, session
  survives a hard refresh, and an admin cannot delete/deactivate their own
  account or remove the last admin.
