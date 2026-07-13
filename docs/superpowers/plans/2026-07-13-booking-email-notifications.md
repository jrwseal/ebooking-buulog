# Booking Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send auto-reply emails at 3 booking events (submitted / approved / rejected) via a real Gmail account, with the Gmail App Password configurable by admins from within the app.

**Architecture:** One Supabase Edge Function (`send-booking-email`) replaces the existing `send-approval-email`, branching content by an `event` param. Gmail App Password lives in a new `email_config` table with RLS locked to zero `select` access (service-role only); the Gmail address itself lives in the existing public-readable `settings` table. Client fires the edge function (fire-and-forget, non-blocking) at each of the 3 booking-state transitions.

**Tech Stack:** Supabase Edge Functions (Deno), `npm:denomailer` for Gmail SMTP, React + Zustand on the client, PostgreSQL/Supabase for storage.

## Global Constraints

- Booking flow (submit / approve / reject) must never fail or block because email sending failed — every email call is fire-and-forget with non-fatal error handling, exactly like the existing `notifyApproval` pattern.
- `email_config.gmail_app_password` must never be selectable via the anon key — no `select` RLS policy on that table, ever.
- No `TBD`/placeholder content in approved/submitted/rejected email templates — all three must render real booking data.
- This project has no test framework (no `vitest`/`jest` in `package.json`) — verification is `npm run build` (tsc type-check) plus manual browser/dev-server checks, not automated unit tests.

---

## File Structure

- **Modify:** `supabase/schema.sql` — add `email_config` table + seed `notify_gmail_address` setting.
- **Delete:** `supabase/functions/send-approval-email/index.ts` (and its dir).
- **Create:** `supabase/functions/send-booking-email/index.ts` — the new unified email sender.
- **Modify:** `src/store/useStore.ts` — rename `notifyApproval` → `notifyStatusChange`, add `notifyGmailAddress` state + `fetchEmailSettings`/`saveEmailSettings`.
- **Modify:** `src/components/modals/BookingModal.tsx` — fire `notifyStatusChange(id, 'submitted')` after successful `addBooking`.
- **Modify:** `src/App.tsx` — fire `notifyStatusChange(id, status)` for both `approved` and `rejected`; call `fetchEmailSettings()` on mount.
- **Modify:** `src/components/modals/AccountManagerModal.tsx` — add "การแจ้งเตือนอีเมล" admin settings section.

---

### Task 1: Database schema — `email_config` table + Gmail address setting

**Files:**
- Modify: `supabase/schema.sql` (append to end of file)

**Interfaces:**
- Produces: table `email_config(id int pk, gmail_app_password text, updated_at timestamptz)`, singleton row `id=1`; setting row `settings('notify_gmail_address', 'jirawat.na@go.buu.ac.th')`. Later tasks (edge function, store) read/write these by exact names.

- [ ] **Step 1: Append the migration SQL**

Add to the end of `supabase/schema.sql`:

```sql

-- ============================================================
-- Email notifications — Gmail SMTP config
-- ============================================================

-- ── การตั้งค่าอีเมลผู้ส่ง (Gmail App Password) ──────────────
-- เก็บแยกจาก settings เพราะต้องปิด select ทั้งหมด (anon key อ่านกลับไม่ได้)
create table if not exists email_config (
  id                 int primary key default 1,
  gmail_app_password text default '',
  updated_at         timestamptz default now(),
  constraint singleton check (id = 1)
);
alter table email_config enable row level security;
-- ไม่มี select policy เลย — anon key อ่านค่านี้กลับไม่ได้เด็ดขาด
-- service role (edge function) bypass RLS อ่านได้ปกติ
drop policy if exists "email_config: insert" on email_config;
create policy "email_config: insert" on email_config for insert with check (true);
drop policy if exists "email_config: update" on email_config;
create policy "email_config: update" on email_config for update using (true);
insert into email_config (id, gmail_app_password) values (1, '')
on conflict (id) do nothing;

-- ── ที่อยู่ Gmail ผู้ส่ง (ไม่ลับ — เก็บใน settings ที่มีอยู่แล้ว) ──
insert into settings (key, value) values ('notify_gmail_address', 'jirawat.na@go.buu.ac.th')
on conflict (key) do update set value = excluded.value;
```

- [ ] **Step 2: Run the migration against the Supabase project**

Open the Supabase project's SQL Editor and run the full contents of `supabase/schema.sql` (idempotent — safe to re-run entirely, matches existing project convention).

- [ ] **Step 3: Verify RLS blocks anon select**

In the browser dev console on the running app (or any page with the Supabase client loaded), run:

```js
await window.supabase.from('email_config').select('*')
```

Expected: `data: []` or a permission error — never the actual `gmail_app_password` value. (If `window.supabase` isn't exposed globally, instead open Supabase Studio → SQL Editor → "Impersonate" the `anon` role, or use the REST API directly: `curl "$SUPABASE_URL/rest/v1/email_config?select=*" -H "apikey: $ANON_KEY"` and confirm the response is empty/forbidden.)

Also verify the `UPDATE ... RETURNING` exfiltration path is blocked (PostgREST implicitly does a `select` after an update unless told not to):

```js
await window.supabase.from('email_config').update({ gmail_app_password: 'probe' }).eq('id', 1).select('gmail_app_password')
```

Expected: no `gmail_app_password` value returned in the response (empty `data` or an error) — the write may succeed, but the value must never come back in the response body.

- [ ] **Step 4: Verify settings row is readable**

```js
await window.supabase.from('settings').select('*').eq('key', 'notify_gmail_address')
```

Expected: one row with `value: 'jirawat.na@go.buu.ac.th'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add email_config table and gmail address setting"
```

---

### Task 2: Edge function — `send-booking-email`

**Files:**
- Delete: `supabase/functions/send-approval-email/index.ts` (remove the whole `send-approval-email` directory)
- Create: `supabase/functions/send-booking-email/index.ts`

**Interfaces:**
- Consumes: `email_config.gmail_app_password` (Task 1), `settings.notify_gmail_address` (Task 1).
- Produces: HTTP endpoint invoked by the client as `supabase.functions.invoke('send-booking-email', { body: { bookingId: string, event: 'submitted' | 'approved' | 'rejected' } })`. Task 3 (store) relies on this exact function name, body shape, and event union.

- [ ] **Step 1: Delete the old function**

```bash
rm -rf "supabase/functions/send-approval-email"
```

- [ ] **Step 2: Create the new function**

Create `supabase/functions/send-booking-email/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'npm:denomailer@1.6.0'

type EmailEvent = 'submitted' | 'approved' | 'rejected'

const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function thaiDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} ${MONTHS_TH[m - 1]} ${y + 543}`
}

interface BookingWithRoom {
  booking_code: string
  title: string
  requester: string
  requester_email: string
  date: string
  start_time: string
  end_time: string
  review_note: string
  rooms: { name: string } | null
  room_id: string
}

function detailRows(b: BookingWithRoom): string {
  const roomName = b.rooms?.name ?? b.room_id
  return `
    <tr><td style="padding:6px 0;color:#64748b;width:120px">รหัสการจอง</td>
        <td style="padding:6px 0;font-weight:700;color:#1e3a5f;font-family:monospace">${b.booking_code}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">หัวข้อ</td>
        <td style="padding:6px 0;font-weight:600">${b.title}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">ผู้จอง</td>
        <td style="padding:6px 0">${b.requester}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">วันที่</td>
        <td style="padding:6px 0">${thaiDate(b.date)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">เวลา</td>
        <td style="padding:6px 0">${b.start_time} – ${b.end_time}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">ห้อง</td>
        <td style="padding:6px 0">${roomName}</td></tr>
  `
}

function buildEmail(event: EmailEvent, b: BookingWithRoom): { subject: string; html: string } {
  const roomName = b.rooms?.name ?? b.room_id

  if (event === 'submitted') {
    return {
      subject: `[${b.booking_code}] ได้รับคำขอจองห้อง ${roomName} แล้ว — รอการอนุมัติ`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <h2 style="color:#1e3a5f;font-size:18px;margin:0 0 16px">ได้รับคำขอจองแล้ว — รอการอนุมัติ</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows(b)}</table>
            <p style="font-size:12px;color:#94a3b8;margin-top:24px">ระบบจะส่งอีเมลแจ้งผลอีกครั้งเมื่อคำขอนี้ได้รับการอนุมัติหรือปฏิเสธ กรุณาเก็บรหัสการจองไว้เพื่อใช้ตรวจสอบสถานะ</p>
          </div>
        </div>
      `,
    }
  }

  if (event === 'approved') {
    return {
      subject: `[${b.booking_code}] การจองห้อง ${roomName} ได้รับการอนุมัติ`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <h2 style="color:#1e3a5f;font-size:18px;margin:0 0 16px">การจองได้รับการอนุมัติแล้ว ✓</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              ${detailRows(b)}
              ${b.review_note && b.review_note !== 'ตารางสอนอาจารย์' ? `<tr><td style="padding:6px 0;color:#64748b">หมายเหตุ</td><td style="padding:6px 0">${b.review_note}</td></tr>` : ''}
            </table>
            <p style="font-size:12px;color:#94a3b8;margin-top:24px">กรุณาเก็บรหัสการจองไว้เพื่อใช้ตรวจสอบสถานะในระบบ</p>
          </div>
        </div>
      `,
    }
  }

  // rejected
  return {
    subject: `[${b.booking_code}] คำขอจองห้อง ${roomName} ถูกปฏิเสธ`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="color:#dc2626;font-size:18px;margin:0 0 16px">คำขอจองถูกปฏิเสธ</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            ${detailRows(b)}
            <tr><td style="padding:6px 0;color:#64748b">เหตุผล</td>
                <td style="padding:6px 0">${b.review_note || '-'}</td></tr>
          </table>
        </div>
      </div>
    `,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  try {
    const { bookingId, event } = await req.json() as { bookingId: string; event: EmailEvent }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, rooms(name)')
      .eq('id', bookingId)
      .single()

    if (error || !booking) return new Response('booking not found', { status: 404 })
    if (!booking.requester_email) return new Response('no email', { status: 200 })

    const { data: configRow } = await supabase
      .from('email_config')
      .select('gmail_app_password')
      .eq('id', 1)
      .single()
    const appPassword = configRow?.gmail_app_password ?? ''
    if (!appPassword) return new Response('not configured', { status: 200 })

    const { data: settingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'notify_gmail_address')
      .single()
    const gmailAddress = settingRow?.value ?? ''
    if (!gmailAddress) return new Response('not configured', { status: 200 })

    const { subject, html } = buildEmail(event, booking as BookingWithRoom)

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: gmailAddress, password: appPassword },
      },
    })

    await client.send({
      from: gmailAddress,
      to: booking.requester_email,
      subject,
      content: 'auto',
      html,
    })
    await client.close()

    return new Response('sent', { status: 200 })
  } catch (err) {
    console.error('[send-booking-email]', err)
    return new Response('error', { status: 500 })
  }
})
```

- [ ] **Step 3: Deploy the function**

```bash
supabase functions deploy send-booking-email --project-ref <your-project-ref>
supabase functions delete send-approval-email --project-ref <your-project-ref>
```

(Use the same `--project-ref` value previously used to deploy `send-approval-email`.)

- [ ] **Step 4: Verify with an unconfigured account (before App Password is set)**

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/send-booking-email" \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<any-existing-booking-id-with-email>","event":"submitted"}'
```

Expected: HTTP 200, body `not configured` (since `email_config.gmail_app_password` is still `''` from Task 1's seed).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-booking-email supabase/functions/send-approval-email
git commit -m "feat(email): replace send-approval-email with unified send-booking-email over Gmail SMTP"
```

---

### Task 3: Store — rename notify action, add email settings state

**Files:**
- Modify: `src/store/useStore.ts`

**Interfaces:**
- Consumes: Supabase tables `settings`, `email_config` (Task 1); edge function `send-booking-email` (Task 2).
- Produces: `notifyGmailAddress: string` state field; `fetchEmailSettings(): Promise<void>`; `saveEmailSettings(gmailAddress: string, appPassword: string): Promise<void>`; `notifyStatusChange(id: string, event: 'submitted' | 'approved' | 'rejected'): Promise<void>` (replaces `notifyApproval`). Tasks 4, 5, 6 call these exact names.

- [ ] **Step 1: Replace `notifyApproval` with `notifyStatusChange` in the interface**

In `src/store/useStore.ts`, find (around line 129):

```ts
  notifyApproval(id: string): Promise<void>
```

Replace with:

```ts
  notifyStatusChange(id: string, event: 'submitted' | 'approved' | 'rejected'): Promise<void>
  notifyGmailAddress: string
  fetchEmailSettings(): Promise<void>
  saveEmailSettings(gmailAddress: string, appPassword: string): Promise<void>
```

- [ ] **Step 2: Add `notifyGmailAddress` to initial state**

Find (around line 141-145):

```ts
export const useStore = create<StoreState>((set) => ({
  rooms: [],
  bookings: [],
  approvers: [],
  loading: false,
```

Replace with:

```ts
export const useStore = create<StoreState>((set) => ({
  rooms: [],
  bookings: [],
  approvers: [],
  loading: false,
  notifyGmailAddress: '',
```

- [ ] **Step 3: Replace the `notifyApproval` implementation**

Find (around line 289-295):

```ts
  async notifyApproval(id: string) {
    try {
      await supabase.functions.invoke('send-approval-email', { body: { bookingId: id } })
    } catch (err) {
      console.warn('[notifyApproval] email send failed:', err)
    }
  },
```

Replace with:

```ts
  async notifyStatusChange(id: string, event: 'submitted' | 'approved' | 'rejected') {
    try {
      await supabase.functions.invoke('send-booking-email', { body: { bookingId: id, event } })
    } catch (err) {
      console.warn('[notifyStatusChange] email send failed:', err)
    }
  },

  async fetchEmailSettings() {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'notify_gmail_address')
        .maybeSingle()
      if (error) throw error
      set({ notifyGmailAddress: data?.value ?? '' })
    } catch (err) {
      console.error('[fetchEmailSettings]', err)
    }
  },

  async saveEmailSettings(gmailAddress: string, appPassword: string) {
    const { error: settingsError } = await supabase
      .from('settings')
      .upsert({ key: 'notify_gmail_address', value: gmailAddress })
    if (settingsError) throw settingsError
    set({ notifyGmailAddress: gmailAddress })

    if (appPassword) {
      const { error: configError } = await supabase
        .from('email_config')
        .update({ gmail_app_password: appPassword, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (configError) throw configError
    }
  },
```

- [ ] **Step 4: Type-check**

```bash
npm run build
```

Expected: fails at this point with errors in `App.tsx` and `BookingModal.tsx` (they still reference `notifyApproval`) — that's expected, fixed in Tasks 4–5. Confirm the *only* errors are about `notifyApproval` not existing, nothing else.

- [ ] **Step 5: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(email): add notifyStatusChange and email settings actions to store"
```

---

### Task 4: Wire "submitted" email into booking creation

**Files:**
- Modify: `src/components/modals/BookingModal.tsx:1-30` (imports/hook destructure), `:160-178` (submit handler)

**Interfaces:**
- Consumes: `notifyStatusChange(id, event)` from Task 3.

- [ ] **Step 1: Import `notifyStatusChange` from the store**

Find (line 22):

```ts
  const { rooms, bookings, addBooking, addSchedule, addSchedules } = useStore()
```

Replace with:

```ts
  const { rooms, bookings, addBooking, addSchedule, addSchedules, notifyStatusChange } = useStore()
```

- [ ] **Step 2: Fire the email after a successful booking**

Find (around line 160-166):

```ts
    setSubmitting(true)
    try {
      const booking = await addBooking({ ...form, title: form.title.trim(), requester: form.requester.trim(), email: form.email.trim() })
      localStorage.setItem('ebooking_email', form.email.trim())
      onSuccess('ส่งคำขอจองแล้ว รอการอนุมัติ')
      onClose()
```

Replace with:

```ts
    setSubmitting(true)
    try {
      const booking = await addBooking({ ...form, title: form.title.trim(), requester: form.requester.trim(), email: form.email.trim() })
      localStorage.setItem('ebooking_email', form.email.trim())
      void notifyStatusChange(booking.id, 'submitted')
      onSuccess('ส่งคำขอจองแล้ว รอการอนุมัติ')
      onClose()
```

- [ ] **Step 3: Type-check**

```bash
npm run build
```

Expected: no new errors from `BookingModal.tsx`.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open the app, submit a new booking with a real email address in the form. Check the terminal running `npm run dev` / browser network tab for a call to the Supabase Edge Function `send-booking-email` with `event: "submitted"` returning 200. (Actual email delivery isn't expected yet — App Password isn't configured until Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/BookingModal.tsx
git commit -m "feat(email): send submitted notification when a booking is created"
```

---

### Task 5: Wire "approved"/"rejected" emails into the review flow

**Files:**
- Modify: `src/App.tsx:31-35` (store destructure), `:63-67` (mount effect), `:154-162` (`handleDecide`)

**Interfaces:**
- Consumes: `notifyStatusChange`, `fetchEmailSettings` from Task 3.

- [ ] **Step 1: Update the store destructure**

Find (line 31-35):

```ts
  const {
    rooms, bookings, approvers, loading,
    fetchRooms, fetchBookings, fetchApprovers,
    updateStatus, removeBooking, changeOwnPassword, clearBookings, notifyApproval,
  } = useStore()
```

Replace with:

```ts
  const {
    rooms, bookings, approvers, loading,
    fetchRooms, fetchBookings, fetchApprovers, fetchEmailSettings,
    updateStatus, removeBooking, changeOwnPassword, clearBookings, notifyStatusChange,
  } = useStore()
```

- [ ] **Step 2: Fetch email settings on mount**

Find (line 63-67):

```ts
  useEffect(() => {
    void fetchRooms()
    void fetchBookings()
    void fetchApprovers()
  }, [fetchRooms, fetchBookings, fetchApprovers])
```

Replace with:

```ts
  useEffect(() => {
    void fetchRooms()
    void fetchBookings()
    void fetchApprovers()
    void fetchEmailSettings()
  }, [fetchRooms, fetchBookings, fetchApprovers, fetchEmailSettings])
```

- [ ] **Step 3: Send email for both approve and reject**

Find (line 154-162):

```ts
  async function handleDecide(id: string, status: Status, note: string) {
    try {
      await updateStatus(id, status, note)
      flash(status === 'approved' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว')
      if (status === 'approved') void notifyApproval(id)
    } catch {
      flash('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }
```

Replace with:

```ts
  async function handleDecide(id: string, status: Status, note: string) {
    try {
      await updateStatus(id, status, note)
      flash(status === 'approved' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว')
      if (status === 'approved' || status === 'rejected') void notifyStatusChange(id, status)
    } catch {
      flash('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }
```

- [ ] **Step 4: Type-check**

```bash
npm run build
```

Expected: no errors referencing `notifyApproval` anywhere in the project (should now be fully gone — grep to confirm):

```bash
grep -rn "notifyApproval" src/
```

Expected: no output.

- [ ] **Step 5: Manual smoke test**

`npm run dev` (if not already running), log in as approver, approve one pending booking and reject another. Confirm both trigger `send-booking-email` calls (check Network tab) with the correct `event` value each time.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(email): send approved/rejected notifications and load email settings on mount"
```

---

### Task 6: Admin UI — Gmail settings in AccountManagerModal

**Files:**
- Modify: `src/components/modals/AccountManagerModal.tsx`

**Interfaces:**
- Consumes: `notifyGmailAddress: string`, `saveEmailSettings(gmailAddress, appPassword)` from Task 3.

- [ ] **Step 1: Add state and store bindings**

Find (line 13-19):

```ts
export default function AccountManagerModal({ onClose, currentUsername }: AccountManagerModalProps) {
  const { approvers, addApprover, removeApprover, setApproverActive } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
```

Replace with:

```ts
export default function AccountManagerModal({ onClose, currentUsername }: AccountManagerModalProps) {
  const { approvers, addApprover, removeApprover, setApproverActive, notifyGmailAddress, saveEmailSettings } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [gmailAddress, setGmailAddress] = useState(notifyGmailAddress)
  const [appPassword, setAppPassword] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
```

- [ ] **Step 2: Add the save handler**

Add this function after `handleRemove` (after line 75, before the `return (`):

```ts
  async function handleSaveEmailSettings() {
    setEmailBusy(true)
    setEmailSaved(false)
    try {
      await saveEmailSettings(gmailAddress.trim(), appPassword.trim())
      setAppPassword('')
      setEmailSaved(true)
    } catch {
      setErr('บันทึกการตั้งค่าอีเมลไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setEmailBusy(false)
    }
  }
```

- [ ] **Step 3: Add the UI section**

Find the closing of the "เพิ่มบัญชีใหม่" block (line 214-221):

```ts
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

Replace with:

```ts
            <button
              onClick={() => void handleAdd()}
              disabled={busy}
              className="flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-50 transition"
            >
              <Plus size={16} aria-hidden="true" /> เพิ่มบัญชี
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">การแจ้งเตือนอีเมล</p>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">ที่อยู่ Gmail ผู้ส่ง</span>
              <input
                className="input"
                placeholder="เช่น jirawat.na@go.buu.ac.th"
                value={gmailAddress}
                onChange={(e) => { setGmailAddress(e.target.value); setEmailSaved(false) }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">App Password</span>
              <input
                className="input"
                type="password"
                placeholder="กรอกใหม่เฉพาะตอนต้องการเปลี่ยน — ไม่แสดงรหัสเดิม"
                value={appPassword}
                onChange={(e) => { setAppPassword(e.target.value); setEmailSaved(false) }}
              />
            </label>
            {emailSaved && (
              <p className="text-sm text-emerald-600">บันทึกการตั้งค่าอีเมลแล้ว</p>
            )}
            <button
              onClick={() => void handleSaveEmailSettings()}
              disabled={emailBusy || !gmailAddress.trim()}
              className="flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-50 transition"
            >
              บันทึกการตั้งค่าอีเมล
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
npm run build
```

Expected: succeeds with no errors.

- [ ] **Step 5: Manual smoke test**

`npm run dev`, log in as an admin, open "จัดการบัญชี", confirm the Gmail address field pre-fills with `jirawat.na@go.buu.ac.th` (from Task 1's seed, loaded via Task 5's `fetchEmailSettings`), type a test App Password, save, confirm the success message appears and the password field clears.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/AccountManagerModal.tsx
git commit -m "feat(email): add Gmail sender settings UI to admin account manager"
```

---

### Task 7: End-to-end verification with a real App Password

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Generate a real Gmail App Password**

Enable 2-Step Verification on `jirawat.na@go.buu.ac.th` if not already enabled, then create an App Password at `myaccount.google.com/apppasswords`.

- [ ] **Step 2: Enter it via the admin UI**

In the running app, open "จัดการบัญชี" as an admin, confirm the Gmail address field, paste the generated App Password, save.

- [ ] **Step 3: Test all 3 events**

- Submit a new booking with your own real email address → confirm a "ได้รับคำขอจองแล้ว" email arrives.
- Approve that booking as an approver → confirm an "ได้รับการอนุมัติแล้ว" email arrives.
- Submit a second booking, reject it with a note → confirm a "ถูกปฏิเสธ" email arrives with the note shown.

- [ ] **Step 4: Confirm no regressions in the core booking flow**

Submit, approve, and reject a few more bookings without paying attention to email — confirm the app's normal booking/approval UI behavior (toasts, status updates, PDF download) is unaffected regardless of email success/failure.
