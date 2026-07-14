# Booking Email Notifications — Design

Date: 2026-07-13

## ปัญหา

ปัจจุบันระบบมี edge function `send-approval-email` ที่ส่งอีเมลเฉพาะตอนแอดมิน **อนุมัติ**คำขอเท่านั้น (ผ่าน Resend API, `FROM_EMAIL` เป็น env var ตายตัว `noreply@buulog.ac.th`) ผู้จองไม่ได้รับอีเมลยืนยันตอนส่งคำขอ และไม่ได้รับแจ้งเมื่อคำขอถูกปฏิเสธ

Resend ส่งอีเมล "จาก" ที่อยู่ `@go.buu.ac.th` จริงไม่ได้เพราะต้อง verify domain DNS ก่อน — ผู้ใช้ต้องการส่งจากบัญชี Gmail จริง (`jirawat.na@go.buu.ac.th`) ชั่วคราว และให้แอดมินตั้งค่าบัญชีนี้ในแอปได้เอง (ไม่ต้องเข้า Supabase dashboard)

## เป้าหมาย

1. ส่งอีเมลอัตโนมัติ 3 จุด: ส่งคำขอ (submitted) / อนุมัติ (approved) / ปฏิเสธ (rejected)
2. ส่งผ่าน Gmail SMTP จริง โดยแอดมินตั้งค่าบัญชี Gmail + App Password ได้ในหน้าแอดมิน
3. รหัสผ่าน Gmail ต้องไม่มีทางถูกอ่านกลับผ่าน anon key (write-only)
4. ระบบจองต้องทำงานได้ปกติแม้ยังไม่ได้ตั้งค่าอีเมล (ส่งอีเมลล้มเหลวแบบไม่บล็อกการจอง)

## Data model

### ตารางใหม่ `email_config` (เก็บ App Password เท่านั้น)

```sql
create table if not exists email_config (
  id                 int primary key default 1,
  gmail_app_password text default '',
  updated_at         timestamptz default now(),
  constraint singleton check (id = 1)
);
alter table email_config enable row level security;
-- ไม่มี policy ใดๆ เลยบนตารางนี้โดยตรง — anon key แตะไม่ได้เลยทั้ง select/insert/update
insert into email_config (id, gmail_app_password) values (1, '')
on conflict (id) do nothing;

-- เขียนรหัสผ่านได้ทางเดียวคือผ่านฟังก์ชันนี้ (SECURITY DEFINER = bypass RLS ของตาราง)
create or replace function set_email_app_password(new_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update email_config set gmail_app_password = new_password, updated_at = now() where id = 1;
end;
$$;
revoke all on function set_email_app_password(text) from public;
grant execute on function set_email_app_password(text) to anon, authenticated;
```

**ทำไมไม่ใช้ RLS policy ตรง ๆ แบบตารางอื่น (approvers/settings):** ลองแล้วพบว่าใช้ไม่ได้จริง — PostgreSQL (ยืนยันบน PG 17 ของโปรเจกต์นี้) ต้องมองเห็นแถวก่อนถึงจะ `UPDATE` ได้ ถ้าตารางไม่มี select policy เลย แม้จะมี update policy เป็น `using (true)` ก็ยังจับคู่แถวไม่เจอ (ยืนยันด้วย `Content-Range: */0` และ `GET DIAGNOSTICS row_count` = 0 จริงบน production) ต่างจาก `approvers`/`settings` ที่มี select policy คู่กันอยู่แล้วจึงใช้ policy ตรงได้ปกติ — สำหรับตารางที่ต้อง "เขียนได้ อ่านไม่ได้เลย" แบบ email_config ต้องใช้ SECURITY DEFINER function แทน ไม่ใช่ policy ตรง ๆ

ความเสี่ยงที่ยอมรับ: `execute` เปิดให้ anon key เรียกได้ (เหมือน pattern เดิมของ `approvers`/`settings` — ระบบภายใน ไม่ได้ทำ Supabase Auth) แต่**อ่านค่ากลับไม่ได้เด็ดขาด** เพราะไม่มี select policy/grant ใดๆ บนตารางเลย และฟังก์ชันก็ return void ไม่ส่งค่ากลับ

### ที่อยู่ Gmail (ไม่ลับ) → เก็บใน `settings` ที่มีอยู่แล้ว

```sql
insert into settings (key, value) values ('notify_gmail_address', 'jirawat.na@go.buu.ac.th')
on conflict (key) do update set value = excluded.value;
```

`settings` มี select policy เปิดอยู่แล้ว (อ่านได้ทุกคน) — เหมาะสำหรับ field ที่ไม่ลับแบบนี้

## Edge Function

แทนที่ `supabase/functions/send-approval-email/` ด้วย `supabase/functions/send-booking-email/`

- Input: `{ bookingId: string, event: 'submitted' | 'approved' | 'rejected' }`
- ดึง booking (+ room name) เหมือนเดิม
- ดึง `gmail_app_password` จาก `email_config` (service role client, RLS bypass) และ `notify_gmail_address` จาก `settings`
- ถ้า `gmail_app_password` หรือ `notify_gmail_address` ว่าง → return 200 "not configured" (ไม่ throw — ระบบจองต้องไม่พัง)
- ประกอบรายการอีเมลที่จะส่งตามเงื่อนไข (ไม่ใช่ 1 ฉบับตายตัวอีกต่อไป):
  - **event = submitted**: เพิ่มอีเมลแจ้งเตือนผู้ดูแลระบบเสมอ (ส่งไปที่ `notify_gmail_address` เอง — ใช้บัญชีเดียวกับที่ส่ง จึงไม่ต้องมี field ผู้รับแยก) หัวข้อ "มีคำขอจองใหม่รอการอนุมัติ"
  - ถ้ามี `requester_email` (ไม่ว่า event ไหน) → เพิ่มอีเมลถึงผู้จองด้วย เนื้อหาแยกตาม `event`:
    - **submitted**: หัวข้อ "ได้รับคำขอจองแล้ว — รอการอนุมัติ", แสดง `booking_code` + รายละเอียดการจอง, ข้อความแจ้งว่าจะอีเมลแจ้งผลอีกครั้งเมื่ออนุมัติ/ปฏิเสธ
    - **approved**: เนื้อหาเดิมจาก `send-approval-email` (คงข้อความเดิมทั้งหมด)
    - **rejected**: หัวข้อ "คำขอจองถูกปฏิเสธ", แสดง `review_note` เป็นเหตุผล
  - ถ้าไม่มีอีเมลใดต้องส่งเลย (event ≠ submitted และไม่มี `requester_email`) → return 200 "no email"
- ส่งผ่าน `denomailer` (`https://deno.land/x/denomailer@1.6.0/mod.ts` — แพ็กเกจนี้ไม่มีบน npm) → `smtp.gmail.com:465`, implicit TLS, auth = `{ username: notify_gmail_address, password: gmail_app_password }`, เปิด SMTP connection ครั้งเดียวแล้ววนส่งทุกฉบับในรายการ (ส่งฝั่งแอดมินก่อนเสมอ เพื่อให้แจ้งเตือนแอดมินสำเร็จแม้อีเมลผู้จองจะผิดพลาด)
- Error จากการส่ง (SMTP auth ผิด, network) → log แล้ว return 500 เหมือนเดิม แต่ฝั่ง client ไม่ throw ต่อ (ดูหัวข้อ client wiring)

## Client wiring

`src/store/useStore.ts`:
- เปลี่ยน `notifyApproval(id)` → `notifyStatusChange(id, event: 'submitted' | 'approved' | 'rejected')` เรียก edge function ใหม่, try/catch แบบเดิม (`console.warn` เมื่อ fail, ไม่ throw)

`src/components/modals/BookingModal.tsx` (จุดที่เรียก `addBooking` สำเร็จ):
- เพิ่มเรียก `notifyStatusChange(booking.id, 'submitted')` แบบ fire-and-forget หลัง insert สำเร็จ

`src/App.tsx` (จุดจัดการ approve/reject ปัจจุบันบรรทัด ~156-158):
- ขยาย logic เดิม `if (status === 'approved') void notifyApproval(id)` เป็นเรียก `notifyStatusChange(id, status)` ทั้งสองกรณี (`approved` และ `rejected`)

## Admin UI

`src/components/modals/AccountManagerModal.tsx` — เพิ่ม section ใหม่ "การแจ้งเตือนอีเมล" (แสดงเฉพาะแอดมิน, ตำแหน่งเดียวกับที่จัดการบัญชีอื่น ๆ):

- ช่องแสดง/แก้ไขที่อยู่ Gmail ผู้ส่ง — โหลดค่าเริ่มต้นจาก `settings.notify_gmail_address`
- ช่อง App Password — เป็น password input, **ค่าเริ่มต้นว่างเปล่าเสมอ** (ไม่ดึงค่าเดิมมาแสดงเพราะอ่านไม่ได้อยู่แล้ว), placeholder อธิบายว่ากรอกเฉพาะตอนต้องการเปลี่ยน
- ปุ่มบันทึก: upsert `settings.notify_gmail_address` เสมอ, เรียก RPC `set_email_app_password(new_password)` เฉพาะเมื่อช่องรหัสผ่านไม่ว่าง

## Error handling / rollout

- Seed ข้อมูลเริ่มต้น: `notify_gmail_address = 'jirawat.na@go.buu.ac.th'`, `email_config.gmail_app_password = ''` — ระบบจองทำงานปกติทันทีหลัง deploy, อีเมลจะยังไม่ส่งจนกว่าแอดมินจะกรอก App Password จริงผ่านหน้าแอดมิน (ต้องเปิด 2FA ในบัญชี Gmail แล้วสร้างที่ `myaccount.google.com/apppasswords` ก่อน)
- ทุกจุดที่เรียก `notifyStatusChange` เป็น fire-and-forget — ความล้มเหลวของอีเมลต้องไม่ทำให้การจอง/อนุมัติ/ปฏิเสธล้มเหลวตาม

## Testing

- Manual: จองห้องใหม่ → ตรวจ edge function log ว่าถูกเรียกด้วย `event: 'submitted'` (ก่อนตั้ง App Password จะเห็น "not configured" ใน log, ไม่มี error)
- หลังแอดมินตั้งค่า App Password จริง: ทดสอบครบ 3 event (submit / approve / reject) ว่าอีเมลไปถึงกล่องจดหมายจริง หัวข้อ/เนื้อหาถูกต้องตาม event
- ทดสอบ RLS: ยืนยันด้วย anon key ว่า `select * from email_config` คืนค่าว่างเปล่า/error (ไม่มี select policy)
