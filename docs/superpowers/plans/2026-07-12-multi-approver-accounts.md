# Multi-approver accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single shared approver PIN with per-person username/password approver accounts, one of which is flagged admin and can create/delete/enable/disable any account.

**Architecture:** New `approvers` Supabase table holds salted-SHA-256 password hashes, checked client-side against the anon key (same trust model the existing PIN system already uses — documented risk, no backend). Zustand store gains CRUD for the table; `App.tsx` swaps its PIN-based login for username/password, persists the session to `localStorage`, and gates a new admin-only account-management modal on an `is_admin` flag.

**Tech Stack:** React 19 + TypeScript, Zustand, Supabase (anon key, no server), Web Crypto (`crypto.subtle`) for hashing, Vite.

## Global Constraints

- This repo has no test framework (no `vitest`/`jest`/test script in `package.json`). "Test" steps in this plan mean: `npm run build` (runs `tsc -b && vite build`, catching type errors) plus a manual verification pass (dev server + browser, or a `node` one-liner for pure functions — Node 19+ exposes `crypto.subtle` globally, same API as the browser).
- Follow existing code patterns exactly: DB row types are `snake_case` interfaces mapped to camelCase app types via a `rowToX` function (see `BookingRow`/`rowToBooking` in `src/store/useStore.ts:7-29,42-66`). Store actions follow `set({ loading: true }) / try / catch (console.error + rethrow) / finally set({ loading: false })`.
- Modals follow the fixed pattern in `src/components/modals/RoomManagerModal.tsx`: `fixed inset-0 z-40 flex ... bg-slate-900/40`, `useFocusTrap`, `role="dialog"`, Escape-to-close, delete-needs-second-click confirmation.
- No new npm dependencies — `crypto.subtle` and `crypto.getRandomValues` are browser/Node built-ins, no polyfill needed (Vite target is modern browsers).
- Password minimum length: 4 characters (matches the old PIN's validation floor already in the codebase).

---

### Task 1: Password hashing utility

**Files:**
- Create: `src/lib/auth/hash.ts`

**Interfaces:**
- Produces: `randomSalt(): string`, `hashPassword(password: string, salt: string): Promise<string>` — used by Task 4 (store) for every password write/verify.

- [ ] **Step 1: Write the module**

```ts
// src/lib/auth/hash.ts
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}
```

- [ ] **Step 2: Verify with a Node one-liner** (Node 19+ has `crypto.subtle`/`crypto.getRandomValues` as globals, same algorithm as the browser)

Run:
```bash
node -e "
async function toHex(bytes){return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function hashPassword(password, salt){
  const data = new TextEncoder().encode(salt + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}
hashPassword('changeme123','seed-salt-0001').then(h => console.log(h))
"
```
Expected: prints a 64-character hex string. Save this exact output — Task 3's seed SQL must produce the identical hash for the same inputs (verified in Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/hash.ts
git commit -m "feat(auth): add salted SHA-256 password hashing helper"
```

---

### Task 2: `Approver` type

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `Approver` type, consumed by Task 4 (store), Task 5 (LoginModal caller), Task 7 (AccountManagerModal), Task 8 (App.tsx).

- [ ] **Step 1: Add the interface**

Append to `src/types/index.ts` (after the `Booking` interface, before its closing context — the file currently ends at line 32 with `Booking`'s closing brace):

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

- [ ] **Step 2: Verify no type errors**

Run: `npm run build`
Expected: build succeeds (this is an additive, unused-so-far export — `tsc` won't complain).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(auth): add Approver type"
```

---

### Task 3: `approvers` table + seed admin (Supabase SQL, manual run)

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `approvers` table with columns `id, username, password_hash, salt, display_name, is_admin, active, created_at` — consumed by every store action in Task 4.

- [ ] **Step 1: Replace the old PIN section with the new table**

In `supabase/schema.sql`, find this block (lines 51-57):

```sql
-- ── ตั้งค่า (รหัส admin) ───────────────────────────────────
create table if not exists settings (
  key   text primary key,
  value text
);
insert into settings (key, value) values ('approver_pin', '123456')
  on conflict (key) do nothing;
```

Replace it with:

```sql
-- ── ตั้งค่า (คงไว้เผื่อใช้ในอนาคต — ไม่ใช้เก็บรหัสผ่านแล้ว) ──
create table if not exists settings (
  key   text primary key,
  value text
);

-- ── บัญชีผู้อนุมัติ ───────────────────────────────────────
-- แทนที่ approver_pin เดิม — หลาย account, มี is_admin คุมสิทธิ์จัดการบัญชีอื่น
create extension if not exists pgcrypto;

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

-- admin เริ่มต้น — เปลี่ยนรหัสผ่านทันทีหลัง deploy ผ่านปุ่ม "รหัสผ่าน" ในแอป
-- (username: admin, password: changeme123)
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

- [ ] **Step 2: Add RLS policies**

In the `RLS — Row Level Security` section, find the `── settings ──` block (lines 89-95):

```sql
-- ── settings ──────────────────────────────────────────────
alter table settings enable row level security;
-- อ่านได้ทุกคน (ไว้ fetch PIN มาตรวจสอบ login)
create policy "settings: read all" on settings for select using (true);
-- update PIN: ทุกคนทำได้ผ่าน anon key (จำเป็นสำหรับ "เปลี่ยนรหัสผ่าน" feature)
-- ความเสี่ยง: ใครก็ update PIN ได้หากรู้ API — ยอมรับได้สำหรับระบบภายใน
create policy "settings: update" on settings for update using (true);
```

Replace it with:

```sql
-- ── settings ──────────────────────────────────────────────
alter table settings enable row level security;
create policy "settings: read all" on settings for select using (true);

-- ── approvers ─────────────────────────────────────────────
alter table approvers enable row level security;
-- อ่านได้ทุกคน (จำเป็นสำหรับตรวจสอบ login ฝั่ง client ด้วย anon key)
create policy "approvers: read all" on approvers for select using (true);
-- insert/update/delete ทำได้ผ่าน anon key เช่นเดียวกับ PIN เดิม
-- ความเสี่ยง: ใครก็แก้ไขบัญชีได้หากรู้ API — ยอมรับได้สำหรับระบบภายใน
-- (ความปลอดภัยสูงกว่านี้ต้องใช้ Supabase Auth ซึ่งไม่ได้เลือกใช้รอบนี้)
create policy "approvers: insert" on approvers for insert with check (true);
create policy "approvers: update" on approvers for update using (true);
create policy "approvers: delete" on approvers for delete using (true);
```

- [ ] **Step 3: Update the column-mapping comment block**

At the end of the file, find:

```sql
-- instructor_name <-> instructorName
```

Add after it:

```sql
-- password_hash   <-> passwordHash
-- display_name    <-> displayName
-- is_admin        <-> isAdmin
```

- [ ] **Step 4: Run manually in the Supabase SQL Editor**

This project has no CLI/migration tooling (single `schema.sql`, run by hand — see the file's own header comment). Open the Supabase project's SQL Editor and run the full updated `supabase/schema.sql`. It's idempotent (`create table if not exists`, `on conflict do nothing`), safe to run against the existing database.

- [ ] **Step 5: Verify the seed hash matches Task 1's Node output**

In the SQL Editor, run:

```sql
select password_hash from approvers where username = 'admin';
```

Expected: the returned hex string is byte-for-byte identical to the output from Task 1 Step 2's `node -e` command. If they don't match, the app's login check will never succeed for the seed admin — stop and re-check the salt/password concatenation order in both places before continuing.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(auth): add approvers table, seed default admin, drop PIN seed"
```

---

### Task 4: Store layer — approvers CRUD, remove PIN

**Files:**
- Modify: `src/store/useStore.ts`

**Interfaces:**
- Consumes: `Approver` (Task 2), `randomSalt`/`hashPassword` (Task 1).
- Produces (added to `StoreState`, consumed by Task 5/7/8):
  - `approvers: Approver[]`
  - `fetchApprovers(): Promise<void>`
  - `addApprover(username: string, displayName: string, password: string, isAdmin: boolean): Promise<void>`
  - `removeApprover(id: string): Promise<void>`
  - `setApproverActive(id: string, active: boolean): Promise<void>`
  - `changeOwnPassword(id: string, currentPassword: string, newPassword: string): Promise<void>` — throws `Error('current password mismatch')` if `currentPassword` doesn't verify.
- Removes: `pin: string`, `fetchPin()`, `changePin(next: string)` (and their `StoreState` interface entries).

- [ ] **Step 1: Add the import and DB row type**

At the top of `src/store/useStore.ts`, change:

```ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Booking, Room, Status } from '../types'
```

to:

```ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { randomSalt, hashPassword } from '../lib/auth/hash'
import type { Approver, Booking, Room, Status } from '../types'
```

Then, right after the `BookingRow` interface (after line 29, before `// ---- Public input type`), add:

```ts
interface ApproverRow {
  id: string
  username: string
  password_hash: string
  salt: string
  display_name: string
  is_admin: boolean
  active: boolean
}

function rowToApprover(row: ApproverRow): Approver {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    salt: row.salt,
    displayName: row.display_name,
    isAdmin: row.is_admin,
    active: row.active,
  }
}
```

- [ ] **Step 2: Update `StoreState` — remove `pin`, add approver fields**

Find (around line 93-113):

```ts
interface StoreState {
  rooms: Room[]
  bookings: Booking[]
  loading: boolean
  pin: string

  fetchRooms(): Promise<void>
  fetchBookings(from?: string, to?: string): Promise<void>
  fetchPin(): Promise<void>
  addBooking(input: BookingInput): Promise<Booking>
  addSchedule(input: BookingInput): Promise<void>
  addSchedules(inputs: BookingInput[]): Promise<void>
  updateStatus(id: string, status: Status, note?: string): Promise<void>
  notifyApproval(id: string): Promise<void>
  checkIn(id: string): Promise<void>
  removeBooking(id: string): Promise<void>
  addRoom(room: Room): Promise<void>
  removeRoom(id: string): Promise<void>
  changePin(next: string): Promise<void>
  clearBookings(): Promise<void>
}
```

Replace with:

```ts
interface StoreState {
  rooms: Room[]
  bookings: Booking[]
  approvers: Approver[]
  loading: boolean

  fetchRooms(): Promise<void>
  fetchBookings(from?: string, to?: string): Promise<void>
  fetchApprovers(): Promise<void>
  addBooking(input: BookingInput): Promise<Booking>
  addSchedule(input: BookingInput): Promise<void>
  addSchedules(inputs: BookingInput[]): Promise<void>
  updateStatus(id: string, status: Status, note?: string): Promise<void>
  notifyApproval(id: string): Promise<void>
  checkIn(id: string): Promise<void>
  removeBooking(id: string): Promise<void>
  addRoom(room: Room): Promise<void>
  removeRoom(id: string): Promise<void>
  addApprover(username: string, displayName: string, password: string, isAdmin: boolean): Promise<void>
  removeApprover(id: string): Promise<void>
  setApproverActive(id: string, active: boolean): Promise<void>
  changeOwnPassword(id: string, currentPassword: string, newPassword: string): Promise<void>
  clearBookings(): Promise<void>
}
```

- [ ] **Step 3: Update initial state**

Find (around line 115-120):

```ts
export const useStore = create<StoreState>((set) => ({
  rooms: [],
  bookings: [],
  loading: false,
  pin: '123456',
```

Replace with:

```ts
export const useStore = create<StoreState>((set) => ({
  rooms: [],
  bookings: [],
  approvers: [],
  loading: false,
```

- [ ] **Step 4: Replace `fetchPin` with `fetchApprovers`**

Find (around line 157-169):

```ts
  async fetchPin() {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'approver_pin')
        .single()
      if (error) throw error
      if (data?.value) set({ pin: data.value as string })
    } catch (err) {
      console.error('[fetchPin]', err)
    }
  },
```

Replace with:

```ts
  async fetchApprovers() {
    try {
      const { data, error } = await supabase
        .from('approvers')
        .select('*')
        .order('username')
      if (error) throw error
      set({ approvers: ((data ?? []) as ApproverRow[]).map(rowToApprover) })
    } catch (err) {
      console.error('[fetchApprovers]', err)
    }
  },
```

- [ ] **Step 5: Replace `changePin` with the four approver actions**

Find (around line 337-344):

```ts
  async changePin(next: string) {
    const { error } = await supabase
      .from('settings')
      .update({ value: next })
      .eq('key', 'approver_pin')
    if (error) throw error
    set({ pin: next })
  },
```

Replace with:

```ts
  async addApprover(username: string, displayName: string, password: string, isAdmin: boolean) {
    set({ loading: true })
    try {
      const salt = randomSalt()
      const passwordHash = await hashPassword(password, salt)
      const { data, error } = await supabase
        .from('approvers')
        .insert({
          username,
          display_name: displayName,
          password_hash: passwordHash,
          salt,
          is_admin: isAdmin,
          active: true,
        })
        .select()
        .single()
      if (error) throw error
      set((state) => ({
        approvers: [...state.approvers, rowToApprover(data as ApproverRow)].sort((a, b) => a.username.localeCompare(b.username)),
      }))
    } catch (err) {
      console.error('[addApprover]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async removeApprover(id: string) {
    set({ loading: true })
    try {
      const { error } = await supabase.from('approvers').delete().eq('id', id)
      if (error) throw error
      set((state) => ({ approvers: state.approvers.filter((a) => a.id !== id) }))
    } catch (err) {
      console.error('[removeApprover]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async setApproverActive(id: string, active: boolean) {
    set({ loading: true })
    try {
      const { error } = await supabase.from('approvers').update({ active }).eq('id', id)
      if (error) throw error
      set((state) => ({
        approvers: state.approvers.map((a) => (a.id === id ? { ...a, active } : a)),
      }))
    } catch (err) {
      console.error('[setApproverActive]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
    const { data, error } = await supabase.from('approvers').select('*').eq('id', id).single()
    if (error) throw error
    const row = data as ApproverRow
    const currentHash = await hashPassword(currentPassword, row.salt)
    if (currentHash !== row.password_hash) throw new Error('current password mismatch')
    const salt = randomSalt()
    const passwordHash = await hashPassword(newPassword, salt)
    const { error: updateError } = await supabase
      .from('approvers')
      .update({ password_hash: passwordHash, salt })
      .eq('id', id)
    if (updateError) throw updateError
    set((state) => ({
      approvers: state.approvers.map((a) => (a.id === id ? { ...a, passwordHash, salt } : a)),
    }))
  },
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: FAILS at this point — `src/App.tsx` still references the now-removed `pin`, `fetchPin`, `changePin`. That's expected; Task 8 fixes it. Confirm the *only* errors are in `App.tsx` referencing those three names (not in `useStore.ts` itself) — that isolates the change to this file correctly.

- [ ] **Step 7: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(auth): replace PIN store actions with approvers CRUD"
```

---

### Task 5: Extract `LoginModal` with username + password fields

**Files:**
- Create: `src/components/modals/LoginModal.tsx`
- Modify: `src/App.tsx` (remove the inline `LoginModal` function; import path changes in Task 8)

**Interfaces:**
- Produces: `LoginModal` component, props `{ onClose: () => void; onSubmit: (username: string, password: string) => Promise<void> }` — consumed by Task 8.

- [ ] **Step 1: Create the new modal file**

```tsx
// src/components/modals/LoginModal.tsx
import { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface LoginModalProps {
  onClose: () => void
  onSubmit: (username: string, password: string) => Promise<void>
}

export default function LoginModal({ onClose, onSubmit }: LoginModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>()

  async function submit() {
    if (!username.trim() || !password || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(username.trim(), password)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="login-modal-title" className="font-bold">เข้าสู่ระบบผู้อนุมัติ</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Lock size={15} className="text-buu" /> เฉพาะผู้มีสิทธิ์อนุมัติเท่านั้น
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">ชื่อผู้ใช้</span>
            <input
              type="text"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="ชื่อผู้ใช้"
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">รหัสผ่าน</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="กรอกรหัสผ่าน"
              className="input"
            />
          </label>
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-60"
          >
            {submitting ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remove the old inline `LoginModal` from `App.tsx`**

Delete the entire function at the end of `src/App.tsx` (currently lines 585-638 — starts at `function LoginModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (pin: string) => void }) {` and ends at its closing `}`).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: still fails (App.tsx now references an undefined `LoginModal` and still has the `pin`/`fetchPin`/`changePin`/`tryLogin` mismatches from Task 4) — confirm the new failure is `'LoginModal' is not defined` (or similar), not an error inside `LoginModal.tsx` itself. Task 8 finishes wiring this.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/LoginModal.tsx src/App.tsx
git commit -m "feat(auth): extract LoginModal with username+password fields"
```

---

### Task 6: Rename `ChangePinModal` → `ChangePasswordModal`

**Files:**
- Create: `src/components/modals/ChangePasswordModal.tsx`
- Delete: `src/components/modals/ChangePinModal.tsx`

**Interfaces:**
- Produces: `ChangePasswordModal` component, props `{ onClose: () => void; onSubmit: (current: string, next: string) => void }` — same shape as the old `ChangePinModal`, consumed by Task 8.

- [ ] **Step 1: Create the renamed file**

```tsx
// src/components/modals/ChangePasswordModal.tsx
import { useState } from 'react'
import { X, KeyRound } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ChangePasswordModalProps {
  onClose: () => void
  onSubmit: (current: string, next: string) => void
}

export default function ChangePasswordModal({ onClose, onSubmit }: ChangePasswordModalProps) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const trapRef = useFocusTrap<HTMLDivElement>()

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="change-password-title" className="font-bold flex items-center gap-2">
            <KeyRound size={16} className="text-buu" aria-hidden="true" /> เปลี่ยนรหัสผ่าน
          </h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">รหัสผ่านปัจจุบัน</span>
            <input
              type="password"
              value={cur}
              autoFocus
              onChange={(e) => setCur(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit(cur, next)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">
              รหัสผ่านใหม่ (อย่างน้อย 4 หลัก)
            </span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit(cur, next)}
              className="input"
            />
          </label>
          <button
            onClick={() => onSubmit(cur, next)}
            className="w-full py-2.5 min-h-[44px] rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark"
          >
            บันทึกรหัสใหม่
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the old file**

```bash
rm src/components/modals/ChangePinModal.tsx
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: still fails (`App.tsx` still imports the now-deleted `ChangePinModal` — fixed in Task 8). Confirm the failure is specifically the missing `ChangePinModal` import, not an error inside the new file.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/ChangePasswordModal.tsx
git rm src/components/modals/ChangePinModal.tsx
git commit -m "refactor(auth): rename ChangePinModal to ChangePasswordModal"
```

---

### Task 7: `AccountManagerModal` (admin CRUD UI)

**Files:**
- Create: `src/components/modals/AccountManagerModal.tsx`

**Interfaces:**
- Consumes: `useStore()` — `approvers`, `addApprover`, `removeApprover`, `setApproverActive` (Task 4).
- Produces: `AccountManagerModal` component, props `{ onClose: () => void; currentUsername: string }` — consumed by Task 8.

- [ ] **Step 1: Create the modal**

```tsx
// src/components/modals/AccountManagerModal.tsx
import { useState } from 'react'
import { X, Plus, Trash2, AlertCircle, ShieldCheck } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface AccountManagerModalProps {
  onClose: () => void
  currentUsername: string
}

const EMPTY = { username: '', displayName: '', password: '', isAdmin: false }

export default function AccountManagerModal({ onClose, currentUsername }: AccountManagerModalProps) {
  const { approvers, addApprover, removeApprover, setApproverActive } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const activeAdminCount = approvers.filter((a) => a.isAdmin && a.active).length

  function setField<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setErr('')
  }

  async function handleAdd() {
    const username = form.username.trim()
    const displayName = form.displayName.trim()
    if (!username) { setErr('กรอกชื่อผู้ใช้'); return }
    if (!displayName) { setErr('กรอกชื่อที่แสดง'); return }
    if (form.password.length < 4) { setErr('รหัสผ่านต้องอย่างน้อย 4 หลัก'); return }
    if (approvers.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      setErr(`ชื่อผู้ใช้ ${username} มีอยู่แล้ว`)
      return
    }
    setBusy(true)
    try {
      await addApprover(username, displayName, form.password, form.isAdmin)
      setForm(EMPTY)
    } catch {
      setErr('เพิ่มไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleActive(id: string, username: string, isAdmin: boolean, active: boolean) {
    if (username === currentUsername) { setErr('ปิดการใช้งานบัญชีตัวเองไม่ได้'); return }
    if (active && isAdmin && activeAdminCount <= 1) { setErr('ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน'); return }
    setBusy(true)
    try {
      await setApproverActive(id, !active)
    } catch {
      setErr('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string, username: string, isAdmin: boolean) {
    if (username === currentUsername) { setErr('ลบบัญชีตัวเองไม่ได้'); return }
    if (isAdmin && activeAdminCount <= 1) { setErr('ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน'); return }
    if (deleteConfirmId !== id) { setDeleteConfirmId(id); return }
    setDeleteConfirmId(null)
    setBusy(true)
    try {
      await removeApprover(id)
    } catch {
      setErr('ลบไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-manager-title"
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <h3 id="account-manager-title" className="font-bold">จัดการบัญชีผู้อนุมัติ</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="space-y-0.5">
            {approvers.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{a.displayName}</span>
                    {a.isAdmin && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-buu bg-buu-tint px-1.5 py-0.5 rounded">
                        <ShieldCheck size={10} /> แอดมิน
                      </span>
                    )}
                    {a.username === currentUsername && (
                      <span className="text-[10px] text-slate-400">(คุณ)</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{a.username}</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                  <input
                    type="checkbox"
                    checked={a.active}
                    disabled={busy}
                    onChange={() => void handleToggleActive(a.id, a.username, a.isAdmin, a.active)}
                    className="w-4 h-4 accent-buu rounded"
                  />
                  ใช้งาน
                </label>
                {deleteConfirmId === a.id ? (
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <button
                      onClick={() => void handleRemove(a.id, a.username, a.isAdmin)}
                      className="font-medium text-rose-600 hover:underline"
                    >
                      ลบ
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="text-slate-400 hover:text-slate-600">
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handleRemove(a.id, a.username, a.isAdmin)}
                    disabled={busy}
                    aria-label={`ลบ ${a.displayName}`}
                    className="w-9 h-9 flex items-center justify-center rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100 disabled:opacity-30"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {approvers.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีบัญชี</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">เพิ่มบัญชีใหม่</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">
                  ชื่อผู้ใช้ <span className="text-rose-400">*</span>
                </span>
                <input
                  className="input"
                  placeholder="เช่น kanya.k"
                  value={form.username}
                  onChange={(e) => setField('username', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">
                  ชื่อที่แสดง <span className="text-rose-400">*</span>
                </span>
                <input
                  className="input"
                  placeholder="เช่น กัญญา คงดี"
                  value={form.displayName}
                  onChange={(e) => setField('displayName', e.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">
                รหัสผ่าน (อย่างน้อย 4 หลัก) <span className="text-rose-400">*</span>
              </span>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setField('isAdmin', e.target.checked)}
                className="w-4 h-4 accent-buu rounded"
              />
              <span className="text-sm text-slate-600">เป็นแอดมิน (จัดการบัญชีอื่นได้)</span>
            </label>

            {err && (
              <p className="flex items-center gap-1.5 text-sm text-rose-600">
                <AlertCircle size={14} aria-hidden="true" /> {err}
              </p>
            )}

            <button
              onClick={() => void handleAdd()}
              disabled={busy}
              className="flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-50 transition"
            >
              <Plus size={16} aria-hidden="true" /> เพิ่มบัญชี
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds — this file only depends on things already added in Tasks 1-4 (no dependency on App.tsx's pending changes).

- [ ] **Step 3: Commit**

```bash
git add src/components/modals/AccountManagerModal.tsx
git commit -m "feat(auth): add admin account-manager modal"
```

---

### Task 8: Wire it all together in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-7 — `Approver` type, store's `approvers`/`fetchApprovers`/`addApprover`/`removeApprover`/`setApproverActive`/`changeOwnPassword`, `LoginModal`, `ChangePasswordModal`, `AccountManagerModal`.

- [ ] **Step 1: Update imports**

Find (around line 3-22):

```ts
import {
  Plus, Lock, LogOut, KeyRound,
  LayoutGrid, CalendarRange, CalendarDays, List, User,
  CheckCircle2, Hourglass, MapPin, X,
  ClipboardCheck, Trash2, DoorOpen, ChevronDown, GraduationCap, ScanLine, Table2,
} from 'lucide-react'
import { useFocusTrap } from './hooks/useFocusTrap'
import { useStore } from './store/useStore'
import MonthView from './components/views/MonthView'
import WeekView from './components/views/WeekView'
import DayView from './components/views/DayView'
import OverviewView from './components/views/OverviewView'
import AgendaView from './components/views/AgendaView'
import MyBookingsView from './components/views/MyBookingsView'
import BookingModal from './components/modals/BookingModal'
import BookingDetailModal from './components/modals/BookingDetailModal'
import ApprovalQueue from './components/modals/ApprovalQueue'
import ChangePinModal from './components/modals/ChangePinModal'
import RoomManagerModal from './components/modals/RoomManagerModal'
import QrScannerModal from './components/modals/QrScannerModal'
import { pad, fmtDate, todayStr } from './utils/datetime'
import type { Booking, Status } from './types'
```

Replace with:

```ts
import {
  Plus, Lock, LogOut, KeyRound,
  LayoutGrid, CalendarRange, CalendarDays, List, User, Users,
  CheckCircle2, Hourglass, MapPin, X,
  ClipboardCheck, Trash2, DoorOpen, ChevronDown, GraduationCap, ScanLine, Table2,
} from 'lucide-react'
import { useFocusTrap } from './hooks/useFocusTrap'
import { useStore } from './store/useStore'
import { hashPassword } from './lib/auth/hash'
import MonthView from './components/views/MonthView'
import WeekView from './components/views/WeekView'
import DayView from './components/views/DayView'
import OverviewView from './components/views/OverviewView'
import AgendaView from './components/views/AgendaView'
import MyBookingsView from './components/views/MyBookingsView'
import BookingModal from './components/modals/BookingModal'
import BookingDetailModal from './components/modals/BookingDetailModal'
import ApprovalQueue from './components/modals/ApprovalQueue'
import ChangePasswordModal from './components/modals/ChangePasswordModal'
import LoginModal from './components/modals/LoginModal'
import AccountManagerModal from './components/modals/AccountManagerModal'
import RoomManagerModal from './components/modals/RoomManagerModal'
import QrScannerModal from './components/modals/QrScannerModal'
import { pad, fmtDate, todayStr } from './utils/datetime'
import type { Booking, Status } from './types'
```

- [ ] **Step 2: Update store destructuring, add `currentApprover` state**

Find (around line 29-37):

```ts
  const {
    rooms, bookings, loading,
    fetchRooms, fetchBookings, fetchPin,
    pin, updateStatus, removeBooking, changePin, clearBookings, notifyApproval,
  } = useStore()

  const [role, setRole] = useState<'requester' | 'approver'>('requester')
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState<ViewMode>('month')
```

Replace with:

```ts
  const {
    rooms, bookings, approvers, loading,
    fetchRooms, fetchBookings, fetchApprovers,
    updateStatus, removeBooking, changeOwnPassword, clearBookings, notifyApproval,
  } = useStore()

  const [role, setRole] = useState<'requester' | 'approver'>('requester')
  const [authed, setAuthed] = useState(false)
  const [currentApprover, setCurrentApprover] = useState<{ username: string; displayName: string; isAdmin: boolean } | null>(null)
  const [sessionRestored, setSessionRestored] = useState(false)
  const [showAccountManager, setShowAccountManager] = useState(false)
  const [view, setView] = useState<ViewMode>('month')
```

- [ ] **Step 3: Update the initial fetch effect and add session restore**

Find (around line 58-66, already includes the overview-tab-reset effect from a prior change):

```ts
  useEffect(() => {
    void fetchRooms()
    void fetchBookings()
    void fetchPin()
  }, [fetchRooms, fetchBookings, fetchPin])

  useEffect(() => {
    if (view === 'overview' && !(role === 'approver' && authed)) setView('month')
  }, [role, authed, view])
```

Replace with:

```ts
  useEffect(() => {
    void fetchRooms()
    void fetchBookings()
    void fetchApprovers()
  }, [fetchRooms, fetchBookings, fetchApprovers])

  useEffect(() => {
    if (sessionRestored || approvers.length === 0) return
    setSessionRestored(true)
    const raw = localStorage.getItem('ebooking_approver_session')
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { username: string }
      const found = approvers.find((a) => a.username === saved.username)
      if (found && found.active) {
        setAuthed(true)
        setRole('approver')
        setCurrentApprover({ username: found.username, displayName: found.displayName, isAdmin: found.isAdmin })
      } else {
        localStorage.removeItem('ebooking_approver_session')
      }
    } catch {
      localStorage.removeItem('ebooking_approver_session')
    }
  }, [approvers, sessionRestored])

  useEffect(() => {
    if (view === 'overview' && !(role === 'approver' && authed)) setView('month')
  }, [role, authed, view])
```

- [ ] **Step 4: Replace `tryLogin` and `logout`**

Find (around line 86-106):

```ts
  function switchRole(r: 'requester' | 'approver') {
    if (r === 'approver' && !authed) { setLoginOpen(true); return }
    setRole(r)
  }

  function tryLogin(input: string) {
    if (input === pin) {
      setAuthed(true)
      setRole('approver')
      setLoginOpen(false)
      flash('เข้าสู่ระบบผู้อนุมัติแล้ว')
    } else {
      flash('รหัสผ่านไม่ถูกต้อง', 'error')
    }
  }

  function logout() {
    setAuthed(false)
    setRole('requester')
    flash('ออกจากระบบแล้ว')
  }
```

Replace with:

```ts
  function switchRole(r: 'requester' | 'approver') {
    if (r === 'approver' && !authed) { setLoginOpen(true); return }
    setRole(r)
  }

  async function tryLogin(username: string, password: string) {
    const found = approvers.find((a) => a.username.toLowerCase() === username.toLowerCase())
    if (!found || !found.active) { flash('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'error'); return }
    const hash = await hashPassword(password, found.salt)
    if (hash !== found.passwordHash) { flash('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'error'); return }
    setAuthed(true)
    setRole('approver')
    setCurrentApprover({ username: found.username, displayName: found.displayName, isAdmin: found.isAdmin })
    localStorage.setItem('ebooking_approver_session', JSON.stringify({ username: found.username }))
    setLoginOpen(false)
    flash(`เข้าสู่ระบบผู้อนุมัติแล้ว (${found.displayName})`)
  }

  function logout() {
    setAuthed(false)
    setRole('requester')
    setCurrentApprover(null)
    localStorage.removeItem('ebooking_approver_session')
    flash('ออกจากระบบแล้ว')
  }
```

- [ ] **Step 5: Replace `handleChangePin` with `handleChangePassword`**

Find (around line 108-117):

```ts
  async function handleChangePin(current: string, next: string) {
    if (current !== pin) { flash('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error'); return }
    if (next.length < 4) { flash('รหัสใหม่ต้องอย่างน้อย 4 หลัก', 'error'); return }
    try {
      await changePin(next)
      setPinModal(false)
      flash('เปลี่ยนรหัสผ่านแล้ว')
    } catch {
      flash('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }
```

Replace with:

```ts
  async function handleChangePassword(current: string, next: string) {
    if (next.length < 4) { flash('รหัสใหม่ต้องอย่างน้อย 4 หลัก', 'error'); return }
    const me = approvers.find((a) => a.username === currentApprover?.username)
    if (!me) { flash('ไม่พบบัญชีผู้ใช้', 'error'); return }
    try {
      await changeOwnPassword(me.id, current, next)
      setPinModal(false)
      flash('เปลี่ยนรหัสผ่านแล้ว')
    } catch {
      flash('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error')
    }
  }
```

- [ ] **Step 6: Add the "บัญชี" admin button**

Find (around line 324-329, right after the "ห้อง" button, inside the `role === 'approver' && authed && (...)` block):

```tsx
              <button
                onClick={() => setShowRoomManager(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
              >
                <DoorOpen size={16} aria-hidden="true" /> ห้อง
              </button>
              <button
                onClick={() => setPinModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition"
              >
                <KeyRound size={15} aria-hidden="true" /> รหัสผ่าน
              </button>
```

Replace with:

```tsx
              <button
                onClick={() => setShowRoomManager(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
              >
                <DoorOpen size={16} aria-hidden="true" /> ห้อง
              </button>
              {currentApprover?.isAdmin && (
                <button
                  onClick={() => setShowAccountManager(true)}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
                >
                  <Users size={16} aria-hidden="true" /> บัญชี
                </button>
              )}
              <button
                onClick={() => setPinModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition"
              >
                <KeyRound size={15} aria-hidden="true" /> รหัสผ่าน
              </button>
```

- [ ] **Step 7: Update the modal render block**

Find (around line 504-518):

```tsx
      {/* Change PIN modal */}
      {pinModal && (
        <ChangePinModal
          onClose={() => setPinModal(false)}
          onSubmit={(current, next) => void handleChangePin(current, next)}
        />
      )}

      {/* Admin login modal */}
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSubmit={tryLogin}
        />
      )}
```

Replace with:

```tsx
      {/* Change password modal */}
      {pinModal && (
        <ChangePasswordModal
          onClose={() => setPinModal(false)}
          onSubmit={(current, next) => void handleChangePassword(current, next)}
        />
      )}

      {/* Approver login modal */}
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSubmit={tryLogin}
        />
      )}

      {/* Account manager modal (admin only) */}
      {showAccountManager && currentApprover && (
        <AccountManagerModal
          onClose={() => setShowAccountManager(false)}
          currentUsername={currentApprover.username}
        />
      )}
```

- [ ] **Step 8: Delete the old inline `LoginModal` function, if any part remains**

Confirm the tail of `src/App.tsx` no longer defines `function LoginModal(...)` — it was deleted in Task 5 Step 2. If it's still there (Task 5 was skipped or reverted), delete it now.

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: succeeds with no errors. If `tsc` reports unused imports or leftover references to `pin`/`fetchPin`/`changePin`/`ChangePinModal`, grep for them and remove:

```bash
grep -n "\bpin\b\|fetchPin\|changePin\|ChangePinModal" src/App.tsx
```
Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "feat(auth): wire username/password login, session persistence, admin account manager"
```

---

### Task 9: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Log in as the seed admin**

In a browser, open the app, click "ผู้อนุมัติ", log in with `admin` / `changeme123` (from Task 3's seed). Expected: toast "เข้าสู่ระบบผู้อนุมัติแล้ว (ผู้ดูแลระบบ)", the "บัญชี" button appears in the toolbar, "ภาพรวม" tab appears first.

- [ ] **Step 3: Change the seed admin's password**

Click "รหัสผ่าน", enter current password `changeme123`, new password `admin1234`. Expected: toast "เปลี่ยนรหัสผ่านแล้ว". Log out, log back in with the new password to confirm it took effect; confirm the old password `changeme123` no longer works.

- [ ] **Step 4: Create a second approver via "บัญชี"**

Click "บัญชี", add username `test.approver`, display name `ทดสอบ อนุมัติ`, password `test1234`, leave "เป็นแอดมิน" unchecked. Expected: new row appears in the list with "ใช้งาน" checked, no แอดมิน badge.

- [ ] **Step 5: Confirm non-admin can't see account management**

Log out, log in as `test.approver` / `test1234`. Expected: login succeeds, but the "บัญชี" button is NOT present in the toolbar.

- [ ] **Step 6: Confirm self-protection guard rails**

Log back in as `admin`. Open "บัญชี". Try to deactivate or delete the `admin` row (your own, currently logged-in account). Expected: inline error "ปิดการใช้งานบัญชีตัวเองไม่ได้" / "ลบบัญชีตัวเองไม่ได้", no change happens.

- [ ] **Step 7: Confirm deactivation blocks login**

In "บัญชี", uncheck "ใช้งาน" for `test.approver`. Log out. Try to log in as `test.approver` / `test1234`. Expected: generic error "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" (no distinction shown between "wrong password" and "account disabled").

- [ ] **Step 8: Confirm session persists across refresh**

While logged in as `admin`, hard-refresh the browser tab. Expected: still logged in as approver/admin (no re-login prompt), "บัญชี" button still visible.

- [ ] **Step 9: Confirm logout clears the session**

Click the logout icon. Refresh the page. Expected: back to requester view, "ผู้อนุมัติ" tab shows the lock icon again.

- [ ] **Step 10: Clean up test data**

In "บัญชี" (logged in as admin), delete the `test.approver` account (it's not the last admin, so this is allowed).

- [ ] **Step 11: Final build check**

```bash
npm run build
```
Expected: succeeds, no TypeScript errors, no unused-import warnings.

- [ ] **Step 12: Stop the dev server, commit any final cleanup if needed**

No file changes expected from this task — it's verification only. If Step 11 surfaced an issue, fix it as part of whichever earlier task owns that file, not as a new ad-hoc change here.

---

## Deployment note

After this plan lands and is pushed, the production Supabase database still needs Task 3's SQL run manually (schema changes aren't part of the Vercel deploy pipeline — this project has no migration runner). Do this **before** merging/deploying the app code, otherwise the deployed app will query a table that doesn't exist yet.
