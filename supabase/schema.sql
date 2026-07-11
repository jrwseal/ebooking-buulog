-- ============================================================
-- eBooking-BUULOG  —  Supabase schema
-- รัน script นี้ใน SQL Editor ของ Supabase project
-- ============================================================

-- ── ห้อง ──────────────────────────────────────────────────
create table if not exists rooms (
  id        text primary key,
  name      text not null,
  type      text not null,
  capacity  int  not null
);

-- ── การจอง ────────────────────────────────────────────────
create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  room_id          text references rooms(id),
  title            text not null,
  requester        text not null,
  requester_email  text default '',
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  purpose          text default '',
  student_id       text default '',
  major            text default '',
  year_level       text default '',
  phone            text default '',
  course_code      text default '',
  course_group     text default '',
  instructor_name  text default '',
  status           text not null default 'pending',  -- pending | approved | rejected
  review_note      text default '',
  booking_code     text default '',
  checked_in       boolean default false,
  created_at       timestamptz default now()
);

-- เพิ่ม columns ในตารางที่มีอยู่แล้ว (รันหากมีตารางอยู่แล้ว):
-- alter table bookings add column if not exists requester_email text default '';
-- alter table bookings add column if not exists booking_code text default '';
-- alter table bookings add column if not exists checked_in boolean default false;
-- alter table bookings add column if not exists student_id text default '';
-- alter table bookings add column if not exists major text default '';
-- alter table bookings add column if not exists year_level text default '';
-- alter table bookings add column if not exists phone text default '';
-- alter table bookings add column if not exists course_code text default '';
-- alter table bookings add column if not exists course_group text default '';
-- alter table bookings add column if not exists instructor_name text default '';

-- ── ตั้งค่า (รหัส admin) ───────────────────────────────────
create table if not exists settings (
  key   text primary key,
  value text
);
insert into settings (key, value) values ('approver_pin', '123456')
  on conflict (key) do nothing;

-- ── ข้อมูลห้องตั้งต้น ──────────────────────────────────────
insert into rooms (id, name, type, capacity) values
  ('LOG-101',  'ห้องบรรยาย 101',             'บรรยาย',     40),
  ('LOG-102',  'ห้องบรรยาย 102',             'บรรยาย',     40),
  ('LOG-201',  'ห้องสัมมนา 201',             'สัมมนา',     25),
  ('LOG-LAB',  'ห้องปฏิบัติการคอมพิวเตอร์', 'แล็บ',       30),
  ('LOG-SIM',  'ห้องจำลองคลังสินค้า',        'ปฏิบัติการ', 20),
  ('LOG-MEET', 'ห้องประชุมคณะ',              'ประชุม',     15)
  on conflict (id) do nothing;

-- ============================================================
-- RLS — Row Level Security
-- ============================================================

-- ── rooms ─────────────────────────────────────────────────
alter table rooms enable row level security;
-- ทุกคนอ่านได้ ไม่มีใคร insert/update/delete ผ่าน anon key
create policy "rooms: read all" on rooms for select using (true);

-- ── bookings ──────────────────────────────────────────────
alter table bookings enable row level security;
-- ทุกคนอ่านได้
create policy "bookings: read all" on bookings for select using (true);
-- ทุกคน insert ได้เฉพาะ status = pending (ป้องกัน insert approved ตรง)
create policy "bookings: insert pending" on bookings for insert
  with check (status = 'pending');
-- update/delete: ต้องผ่าน service_role (ทำผ่าน Supabase dashboard หรือ Edge Function)
-- หมายเหตุ: ระบบนี้ตรวจสอบรหัส admin ฝั่ง client (anon key)
-- สำหรับความปลอดภัยสูงกว่า ให้ใช้ Supabase Auth + RLS policy เฉพาะ authenticated users

-- ── settings ──────────────────────────────────────────────
alter table settings enable row level security;
-- อ่านได้ทุกคน (ไว้ fetch PIN มาตรวจสอบ login)
create policy "settings: read all" on settings for select using (true);
-- update PIN: ทุกคนทำได้ผ่าน anon key (จำเป็นสำหรับ "เปลี่ยนรหัสผ่าน" feature)
-- ความเสี่ยง: ใครก็ update PIN ได้หากรู้ API — ยอมรับได้สำหรับระบบภายใน
create policy "settings: update" on settings for update using (true);

-- ============================================================
-- Column mapping  (DB  <->  App)
-- ============================================================
-- room_id     <-> roomId
-- start_time  <-> start
-- end_time    <-> end
-- review_note <-> reviewNote
-- created_at  <-> createdAt (unix ms)
-- student_id      <-> studentId
-- year_level      <-> year
-- course_code     <-> courseCode
-- course_group    <-> courseGroup
-- instructor_name <-> instructorName
