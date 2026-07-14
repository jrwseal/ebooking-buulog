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
drop policy if exists "rooms: read all" on rooms;
create policy "rooms: read all" on rooms for select using (true);

-- ── bookings ──────────────────────────────────────────────
alter table bookings enable row level security;
-- ทุกคนอ่านได้
drop policy if exists "bookings: read all" on bookings;
create policy "bookings: read all" on bookings for select using (true);
-- ทุกคน insert ได้เฉพาะ status = pending (ป้องกัน insert approved ตรง)
drop policy if exists "bookings: insert pending" on bookings;
create policy "bookings: insert pending" on bookings for insert
  with check (status = 'pending');
-- update/delete: ต้องผ่าน service_role (ทำผ่าน Supabase dashboard หรือ Edge Function)
-- หมายเหตุ: ระบบนี้ตรวจสอบรหัส admin ฝั่ง client (anon key)
-- สำหรับความปลอดภัยสูงกว่า ให้ใช้ Supabase Auth + RLS policy เฉพาะ authenticated users

-- ── settings ──────────────────────────────────────────────
alter table settings enable row level security;
drop policy if exists "settings: read all" on settings;
create policy "settings: read all" on settings for select using (true);
-- insert/update เปิดให้ anon key เขียนได้ (เหมือน approvers/email_config — ระบบภายใน)
-- จำเป็นสำหรับหน้าแอดมินแก้ไข notify_gmail_address ผ่านแอปได้เอง
drop policy if exists "settings: insert" on settings;
create policy "settings: insert" on settings for insert with check (true);
drop policy if exists "settings: update" on settings;
create policy "settings: update" on settings for update using (true);

-- ── approvers ─────────────────────────────────────────────
alter table approvers enable row level security;
-- อ่านได้ทุกคน (จำเป็นสำหรับตรวจสอบ login ฝั่ง client ด้วย anon key)
drop policy if exists "approvers: read all" on approvers;
create policy "approvers: read all" on approvers for select using (true);
-- insert/update/delete ทำได้ผ่าน anon key เช่นเดียวกับ PIN เดิม
-- ความเสี่ยง: ใครก็แก้ไขบัญชีได้หากรู้ API — ยอมรับได้สำหรับระบบภายใน
-- (ความปลอดภัยสูงกว่านี้ต้องใช้ Supabase Auth ซึ่งไม่ได้เลือกใช้รอบนี้)
drop policy if exists "approvers: insert" on approvers;
create policy "approvers: insert" on approvers for insert with check (true);
drop policy if exists "approvers: update" on approvers;
create policy "approvers: update" on approvers for update using (true);
drop policy if exists "approvers: delete" on approvers;
create policy "approvers: delete" on approvers for delete using (true);

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
-- password_hash   <-> passwordHash
-- display_name    <-> displayName
-- is_admin        <-> isAdmin

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
