# eBooking-BUULOG — ระบบจองห้องเรียน คณะโลจิสติกส์ ม.บูรพา

React + TypeScript + Vite frontend เชื่อมต่อ Supabase (PostgreSQL)

---

## สแตก

| ส่วน | เทคโนโลยี |
|---|---|
| UI Framework | React 19 + TypeScript 5.7 |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| State | Zustand v5 |
| Icons | lucide-react |
| ฐานข้อมูล | Supabase (PostgreSQL) |
| Hosting | Vercel |

---

## ตั้งค่า Supabase

### 1. สร้าง Supabase Project

ไปที่ [supabase.com](https://supabase.com) → New Project

### 2. รัน Schema

เปิด **SQL Editor** ใน Supabase dashboard แล้วรัน `supabase/schema.sql` ทั้งไฟล์

สิ่งที่ script สร้าง:
- ตาราง `rooms` — ห้องทั้งหมด (พร้อม seed data 6 ห้อง)
- ตาราง `bookings` — การจอง
- ตาราง `settings` — รหัส admin (`approver_pin`, default `123456`)
- RLS policies — ทุกคนอ่านได้, insert เฉพาะ `pending`, update ผ่าน anon key

### 3. คัดลอก API Keys

Supabase dashboard → **Project Settings → API**:
- `Project URL` → `VITE_SUPABASE_URL`
- `anon / public` key → `VITE_SUPABASE_ANON_KEY`

---

## ตั้งค่า Environment

```bash
cp .env.local.example .env.local
```

แก้ `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## รัน Dev

```bash
npm install
npm run dev
```

เปิด [http://localhost:5173](http://localhost:5173)

---

## Build Production

```bash
npm run build
```

ผลลัพธ์อยู่ที่ `dist/` — สามารถ serve ด้วย static file server ใดก็ได้

---

## Deploy บน Vercel

1. **Push ขึ้น GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

2. **Import ใน Vercel**
   - ไปที่ [vercel.com/new](https://vercel.com/new) → Import Git Repository
   - เลือก repo → Vercel ตรวจจับ Vite อัตโนมัติ (Framework: **Vite**, Build: `npm run build`, Output: `dist`)

3. **ตั้ง Environment Variables** ใน Vercel project settings:
   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` |

4. **Deploy** — Vercel deploy ให้อัตโนมัติทุกครั้งที่ push เข้า `main`

---

## โครงสร้างโปรเจกต์

```
src/
  lib/
    supabase.ts       Supabase client
    config.ts         ค่าคงที่ตารางเวลา (08:00–20:00, PXPM)
  types/
    index.ts          Room, Booking, Status types
  store/
    useStore.ts       Zustand store — CRUD ทั้งหมด
  utils/
    datetime.ts       helper Thai date/time
  components/
    views/
      MonthView.tsx   ปฏิทินเดือน
      WeekView.tsx    ตารางเวลา 7 วัน
      DayView.tsx     ตารางเวลารายวัน (columns = ห้อง)
      AgendaView.tsx  รายการที่กำลังจะมาถึง
    modals/
      BookingModal.tsx      ฟอร์มจองห้อง
      BookingDetailModal.tsx รายละเอียด + อนุมัติ/ปฏิเสธ
      ApprovalQueue.tsx     คิว admin
      ChangePinModal.tsx    เปลี่ยนรหัสผ่าน
    ScheduleGrid.tsx  grid เวลาพร้อม lane packing
    Legend.tsx        คำอธิบายสี
  App.tsx             shell หลัก
supabase/
  schema.sql          SQL สร้างตาราง + RLS + seed
public/
  buulog.png          โลโก้ BUULOG
```

---

## บทบาทผู้ใช้

| บทบาท | การเข้าถึง |
|---|---|
| ผู้จอง | ดูตาราง, ส่งคำขอจอง, ยกเลิกคำขอของตัวเอง (pending) |
| ผู้อนุมัติ | ทุกอย่างของผู้จอง + อนุมัติ/ปฏิเสธ/ลบ/เปลี่ยนรหัส/ล้างข้อมูล |

**Login:** กด "ผู้อนุมัติ" → ใส่รหัสผ่าน (default `123456`)
Auth state เก็บใน memory เท่านั้น — รีโหลดต้อง login ใหม่

---

## ข้อควรรู้ด้านความปลอดภัย

> anon key อยู่ที่ฝั่ง client — การ login แบบนี้กันคนทั่วไปออกจากหน้า admin แต่ไม่กัน API call ตรง

สำหรับระบบใช้งานจริงที่ต้องการความปลอดภัยสูงกว่า:
- ใช้ **Supabase Auth** ทำบัญชี admin จริง
- ตั้ง RLS policy ให้เฉพาะ authenticated user อัปเดต/ลบได้
- ย้าย PIN check ไปยัง **Edge Function** ฝั่ง server
