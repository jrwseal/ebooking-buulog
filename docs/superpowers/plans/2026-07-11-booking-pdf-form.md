# Booking PDF Form + Ref Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student submits a room booking, capture the fields the official `FORM-นิสิตขอใช้ห้องอาคารคณะโลจิสติกส์.pdf` memo requires, and let them generate a filled PDF of that memo — stamped with the existing `bookingCode` as a trackable ref number — straight from the booking detail view.

**Architecture:** Extend the `Booking` data model with 7 new student-flow fields, wire them into `BookingModal`'s non-admin path and into Supabase. Build the PDF client-side by rendering a plain-HTML replica of the memo off-screen, rasterizing it with `html2canvas` (so the browser — not a PDF library — does Thai text shaping), and embedding that image into a single-page `jsPDF` document. Trigger from a new button in `BookingDetailModal`.

**Tech Stack:** React 19 + TypeScript, Zustand store, Supabase (Postgres), `html2canvas@1.4.1`, `jspdf@4.2.1`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-11-booking-pdf-form-design.md` — every task below implements a section of it.
- New fields apply **only** to the student/requester flow (`BookingModal` with `adminMode={false}`). The admin teaching-schedule path is untouched.
- Reuse the existing `bookingCode` (`LOG-XXXXXX`, generated in `inputToRow`) as the tracking ref printed on the PDF. Do **not** build a new sequence/counter.
- Single-day bookings only (existing `date`/`start`/`end` shape) — no date-range fields.
- The PDF template must use **plain inline styles with hex colors only** (`#000000`, `#ffffff`, etc.) — never Tailwind utility classes or the app's `oklch()` theme tokens (`--color-buu*`, `.input`). `html2canvas` cannot parse `oklch()` and will corrupt or drop colors that use it. The template is monochrome anyway (matches the real paper form), so this is a non-issue in practice as long as no Tailwind class or CSS variable leaks in.
- New required-string fields (`studentId`, `major`, `year`, `phone`, `courseCode`, `courseGroup`) follow the existing `email` field's precedent in `BookingModal.tsx`: always present in form state (default `''`), only rendered as inputs and only validated when `!adminMode`. `instructorName` is optional everywhere (never validated as required).
- No automated test harness exists in this repo (no test script in `package.json`, no test files anywhere). Verification steps below use `npx tsc --noEmit -p tsconfig.app.json` (type-check as a compile-time correctness check) plus manual dev-server/browser checks, per the spec's own Testing section. Do not introduce a new test framework as part of this plan — out of scope.

---

### Task 1: Extend booking data model end-to-end (types, Supabase mapping, student form fields)

**Files:**
- Modify: `src/types/index.ts:10-25` (`Booking` interface)
- Modify: `src/store/useStore.ts:7-22` (`BookingRow` interface), `:35-52` (`rowToBooking`), `:54-68` (`inputToRow`)
- Modify: `src/components/modals/BookingModal.tsx:22-31` (form state), `:69-81` (`handleSubmit` validation), `:208-232` (JSX fields)
- Modify: `supabase/schema.sql:15-35` (columns + migration comment), `:84-91` (column-mapping comment block)

**Interfaces:**
- Produces: `Booking` and `BookingInput` (the latter derived automatically via `Omit<Booking, 'id' | 'status' | 'reviewNote' | 'bookingCode' | 'checkedIn' | 'createdAt'>` in `useStore.ts:26`) both gain 7 new required `string` properties: `studentId, major, year, phone, courseCode, courseGroup, instructorName`. Later tasks (PDF generation) read these directly off a `Booking` instance.

- [ ] **Step 1: Add the 7 fields to the `Booking` interface**

Edit `src/types/index.ts`, inserting after `purpose: string` (currently line 19):

```ts
export interface Booking {
  id: string
  roomId: string
  title: string
  requester: string
  email: string
  date: string
  start: string
  end: string
  purpose: string
  studentId: string
  major: string
  year: string
  phone: string
  courseCode: string
  courseGroup: string
  instructorName: string
  status: Status
  reviewNote: string
  bookingCode: string
  checkedIn: boolean
  createdAt: number
}
```

- [ ] **Step 2: Type-check and confirm the expected interim failures**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: FAIL. Errors in `src/store/useStore.ts` (`rowToBooking` return object missing the new properties) and `src/components/modals/BookingModal.tsx` (initial `form` state object missing the new properties). This is expected — both are fixed in the next steps.

- [ ] **Step 3: Map the new fields in `useStore.ts`**

Edit `src/store/useStore.ts`. In the `BookingRow` interface (after `purpose: string`, currently line 16):

```ts
interface BookingRow {
  id: string
  room_id: string
  title: string
  requester: string
  requester_email: string
  date: string
  start_time: string
  end_time: string
  purpose: string
  student_id: string
  major: string
  year_level: string
  phone: string
  course_code: string
  course_group: string
  instructor_name: string
  status: string
  review_note: string
  booking_code: string
  checked_in: boolean
  created_at: string
}
```

In `rowToBooking` (after `purpose: row.purpose,`, currently line 45):

```ts
function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    requester: row.requester,
    email: row.requester_email ?? '',
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    purpose: row.purpose,
    studentId: row.student_id ?? '',
    major: row.major ?? '',
    year: row.year_level ?? '',
    phone: row.phone ?? '',
    courseCode: row.course_code ?? '',
    courseGroup: row.course_group ?? '',
    instructorName: row.instructor_name ?? '',
    status: row.status as Status,
    reviewNote: row.review_note,
    bookingCode: row.booking_code ?? '',
    checkedIn: row.checked_in ?? false,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}
```

In `inputToRow` (after `purpose: input.purpose,`, currently line 63):

```ts
function inputToRow(input: BookingInput) {
  return {
    room_id: input.roomId,
    title: input.title,
    requester: input.requester,
    requester_email: input.email ?? '',
    date: input.date,
    start_time: input.start,
    end_time: input.end,
    purpose: input.purpose,
    student_id: input.studentId,
    major: input.major,
    year_level: input.year,
    phone: input.phone,
    course_code: input.courseCode,
    course_group: input.courseGroup,
    instructor_name: input.instructorName,
    status: 'pending' as const,
    review_note: '',
    booking_code: generateCode(),
  }
}
```

- [ ] **Step 4: Type-check again, expect only `BookingModal.tsx` errors remaining**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: FAIL, only in `src/components/modals/BookingModal.tsx` (initial `form` state still missing the new properties).

- [ ] **Step 5: Add the new fields to `BookingModal.tsx` form state**

Edit the `useState<BookingInput>` initializer (currently lines 22-31):

```ts
  const [form, setForm] = useState<BookingInput>({
    roomId: defaultRoomId ?? rooms[0]?.id ?? '',
    title: '',
    requester: '',
    email: '',
    date: defaultDate || todayStr,
    start: defaultHour !== undefined ? `${pad(defaultHour)}:00` : '09:00',
    end: defaultHour !== undefined ? `${pad(Math.min(20, defaultHour + 1))}:00` : '12:00',
    purpose: '',
    studentId: '',
    major: '',
    year: '',
    phone: '',
    courseCode: '',
    courseGroup: '',
    instructorName: '',
  })
```

- [ ] **Step 6: Type-check, expect PASS**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: PASS (0 errors).

- [ ] **Step 7: Add validation for the new required fields**

Edit `handleSubmit` in `BookingModal.tsx` (currently lines 69-81), inserting the new check right after the existing email check (after `if (!adminMode && !/.+@.+\..+/.test(form.email.trim())) { onError('กรอก email ให้ถูกต้อง'); return }`):

```ts
    if (!adminMode) {
      const required: Array<[string, string]> = [
        [form.studentId, 'รหัสนิสิต'],
        [form.major, 'สาขาวิชา/แขนงวิชา'],
        [form.year, 'ชั้นปีที่'],
        [form.phone, 'เบอร์โทรศัพท์'],
        [form.courseCode, 'รหัสวิชา'],
        [form.courseGroup, 'กลุ่ม'],
      ]
      const missing = required.find(([value]) => !value.trim())
      if (missing) {
        onError(`กรอก${missing[1]}ให้ครบ`)
        return
      }
    }
```

- [ ] **Step 8: Add the new input fields to the JSX**

Edit `BookingModal.tsx`, inserting after the email `Field` block (currently lines 208-218, right before the date/time grid `<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">`):

```tsx
          {!adminMode && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="รหัสนิสิต *">
                  <input
                    value={form.studentId}
                    onChange={(e) => update('studentId', e.target.value)}
                    placeholder="เช่น 64010123"
                    className="input"
                  />
                </Field>
                <Field label="ชั้นปีที่ *">
                  <input
                    value={form.year}
                    onChange={(e) => update('year', e.target.value)}
                    placeholder="เช่น 3"
                    className="input"
                  />
                </Field>
              </div>
              <Field label="สาขาวิชา/แขนงวิชา *">
                <input
                  value={form.major}
                  onChange={(e) => update('major', e.target.value)}
                  placeholder="เช่น การจัดการโลจิสติกส์และโซ่อุปทาน"
                  className="input"
                />
              </Field>
              <Field label="เบอร์โทรศัพท์ *">
                <input
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="เช่น 0812345678"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="รหัสวิชา *">
                  <input
                    value={form.courseCode}
                    onChange={(e) => update('courseCode', e.target.value)}
                    placeholder="เช่น 88420159"
                    className="input"
                  />
                </Field>
                <Field label="กลุ่ม *">
                  <input
                    value={form.courseGroup}
                    onChange={(e) => update('courseGroup', e.target.value)}
                    placeholder="เช่น 1"
                    className="input"
                  />
                </Field>
              </div>
              <Field label="อาจารย์ประจำวิชาผู้รับรอง (ถ้ามี)">
                <input
                  value={form.instructorName}
                  onChange={(e) => update('instructorName', e.target.value)}
                  placeholder="ชื่อ-นามสกุล อาจารย์ผู้รับรอง"
                  className="input"
                />
              </Field>
            </>
          )}
```

- [ ] **Step 9: Type-check, expect PASS**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: PASS (0 errors).

- [ ] **Step 10: Add the Supabase columns**

Edit `supabase/schema.sql`. In the `bookings` table definition (currently lines 15-30), add after `purpose text default '',`:

```sql
  student_id       text default '',
  major            text default '',
  year_level       text default '',
  phone            text default '',
  course_code      text default '',
  course_group     text default '',
  instructor_name  text default '',
```

In the migration-comment block right below (currently lines 32-35), add:

```sql
-- alter table bookings add column if not exists student_id text default '';
-- alter table bookings add column if not exists major text default '';
-- alter table bookings add column if not exists year_level text default '';
-- alter table bookings add column if not exists phone text default '';
-- alter table bookings add column if not exists course_code text default '';
-- alter table bookings add column if not exists course_group text default '';
-- alter table bookings add column if not exists instructor_name text default '';
```

In the "Column mapping" comment block at the bottom of the file (currently lines 84-91), add:

```sql
-- student_id      <-> studentId
-- year_level      <-> year
-- course_code     <-> courseCode
-- course_group    <-> courseGroup
-- instructor_name <-> instructorName
```

- [ ] **Step 11: Apply the schema change to the live Supabase project**

Run the new `alter table` statements from Step 10 in the Supabase SQL editor for this project (uncomment and run them — they're written as `if not exists` so safe to re-run).

- [ ] **Step 12: Manual verification**

Run: `npm run dev`

In the browser: switch to requester role, click "จองห้อง", fill in the form including the new fields with Thai text containing tone-mark combinations (e.g. major `การจัดการโลจิสติกส์`, phone `0812345678`, studentId `64010123`), submit. Confirm:
- No console errors.
- The booking appears in the calendar/agenda view with the entered title.
- Open the booking detail — confirm it still renders correctly (new fields aren't shown there yet — that's fine, they land in Task 3).

- [ ] **Step 13: Commit**

```bash
git add src/types/index.ts src/store/useStore.ts src/components/modals/BookingModal.tsx supabase/schema.sql
git commit -m "feat(booking): capture student form fields for room-request memo"
```

---

### Task 2: PDF template + generator library

**Files:**
- Modify: `package.json` (add `html2canvas`, `jspdf` dependencies)
- Create: `src/lib/pdf/bookingFormTemplate.ts`
- Create: `src/lib/pdf/generateBookingPdf.ts`

**Interfaces:**
- Consumes: `Booking`, `Room` from `src/types/index.ts` (extended in Task 1); `parseDate`, `TH_MONTHS` from `src/utils/datetime.ts`.
- Produces: `buildBookingFormElement(data: BookingFormData): HTMLDivElement` (exported from `bookingFormTemplate.ts`) and `downloadBookingPdf(booking: Booking, room: Room): Promise<void>` (exported from `generateBookingPdf.ts`). Task 3 calls `downloadBookingPdf` directly.

- [ ] **Step 1: Install dependencies**

```bash
npm install html2canvas@1.4.1 jspdf@4.2.1
```

- [ ] **Step 2: Create the template builder**

Create `src/lib/pdf/bookingFormTemplate.ts`:

```ts
export interface BookingFormData {
  refCode: string
  studentName: string
  studentId: string
  major: string
  year: string
  phone: string
  roomName: string
  purpose: string
  courseCode: string
  courseName: string
  courseGroup: string
  day: string
  month: string
  yearBE: string
  startTime: string
  endTime: string
  instructorName: string
}

function textSpan(text: string): HTMLSpanElement {
  const s = document.createElement('span')
  s.textContent = text
  return s
}

function blankSpan(value: string, minWidth = '90px'): HTMLSpanElement {
  const s = document.createElement('span')
  s.textContent = value || ' '
  s.style.cssText =
    `display:inline-block;min-width:${minWidth};border-bottom:1px solid #000;` +
    'padding:0 4px;font-weight:600;text-align:center;'
  return s
}

function row(...spans: HTMLSpanElement[]): HTMLDivElement {
  const r = document.createElement('div')
  r.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:4px;margin:8px 0;font-size:15px;line-height:1.7;'
  spans.forEach((s) => r.appendChild(s))
  return r
}

export function buildBookingFormElement(data: BookingFormData): HTMLDivElement {
  const page = document.createElement('div')
  page.style.cssText = [
    'width:794px',
    'min-height:1123px',
    'box-sizing:border-box',
    'padding:56px 64px',
    'background:#ffffff',
    'color:#000000',
    "font-family:'Sarabun',sans-serif",
    'position:fixed',
    'left:-9999px',
    'top:0',
  ].join(';')

  const refLine = document.createElement('div')
  refLine.style.cssText = 'text-align:right;font-size:13px;margin-bottom:4px;'
  refLine.textContent = `เลขที่อ้างอิงติดตามสถานะ: ${data.refCode}`
  page.appendChild(refLine)

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:8px;'
  const logo = document.createElement('img')
  logo.src = '/buulog.png'
  logo.style.cssText = 'width:56px;height:56px;object-fit:contain;'
  const titleWrap = document.createElement('div')
  titleWrap.style.cssText = 'flex:1;text-align:center;'
  const title = document.createElement('div')
  title.textContent = 'บันทึกข้อความ'
  title.style.cssText = 'font-size:22px;font-weight:700;'
  titleWrap.appendChild(title)
  const spacer = document.createElement('div')
  spacer.style.cssText = 'width:56px;'
  header.appendChild(logo)
  header.appendChild(titleWrap)
  header.appendChild(spacer)
  page.appendChild(header)

  page.appendChild(row(textSpan('ส่วนงาน คณะโลจิสติกส์ โทร. ๓๑๐๒ - ๓๑๐๓')))
  page.appendChild(row(textSpan('ที่ อว 8112.1/'), blankSpan('', '160px')))
  page.appendChild(row(textSpan('เรื่อง ขอใช้ห้องคณะโลจิสติกส์')))
  page.appendChild(row(textSpan('เรียน คณบดีคณะโลจิสติกส์')))

  page.appendChild(row(
    textSpan('ด้วยข้าพเจ้า ชื่อ'), blankSpan(data.studentName, '220px'),
    textSpan('รหัสนิสิต'), blankSpan(data.studentId, '140px'),
  ))
  page.appendChild(row(
    textSpan('เป็นนิสิตสาขาวิชา/แขนงวิชา'), blankSpan(data.major, '220px'),
    textSpan('ชั้นปีที่'), blankSpan(data.year, '50px'),
    textSpan('เบอร์โทรศัพท์'), blankSpan(data.phone, '140px'),
  ))
  page.appendChild(row(
    textSpan('มีความประสงค์ขอใช้ห้อง'), blankSpan(data.roomName, '160px'),
    textSpan('เพื่อ'), blankSpan(data.purpose, '260px'),
  ))
  page.appendChild(row(
    textSpan('ในรายวิชา รหัสวิชา'), blankSpan(data.courseCode, '140px'),
    textSpan('ชื่อวิชา'), blankSpan(data.courseName, '220px'),
    textSpan('กลุ่ม'), blankSpan(data.courseGroup, '60px'),
  ))
  page.appendChild(row(
    textSpan('ในวันที่'), blankSpan(data.day, '50px'),
    textSpan('เดือน'), blankSpan(data.month, '140px'),
    textSpan('พ.ศ.'), blankSpan(data.yearBE, '70px'),
    textSpan('เวลา'), blankSpan(data.startTime, '70px'), textSpan('น.'),
  ))
  page.appendChild(row(
    textSpan('ถึงวันที่'), blankSpan(data.day, '50px'),
    textSpan('เดือน'), blankSpan(data.month, '140px'),
    textSpan('พ.ศ.'), blankSpan(data.yearBE, '70px'),
    textSpan('เวลา'), blankSpan(data.endTime, '70px'), textSpan('น.'),
  ))

  const consent = document.createElement('p')
  consent.style.cssText = 'font-size:15px;line-height:1.9;margin:16px 0;'
  consent.textContent =
    'ในการนี้ ข้าพเจ้าจะดูแลและรับผิดชอบอุปกรณ์ทุกอย่างภายในห้องหากเกิดความเสียหาย ให้อยู่ในสภาพดีดังเดิม ' +
    'หากมีความเสียหายเกิดขึ้น ข้าพเจ้ายินดีรับผิดชอบค่าเสียหายที่เกิดขึ้นทั้งหมดแก่คณะโลจิสติกส์ ' +
    'จึงเรียนมาเพื่อโปรดให้ความอนุเคราะห์ในการนี้ด้วย จักขอบคุณยิ่ง'
  page.appendChild(consent)

  const sigWrap = document.createElement('div')
  sigWrap.style.cssText = 'display:flex;justify-content:flex-end;margin-top:24px;font-size:14px;text-align:center;'
  const sigBlock = document.createElement('div')
  const sigLabel1 = document.createElement('div')
  sigLabel1.textContent = 'นิสิตผู้ขอใช้ห้อง'
  const sigDots1 = document.createElement('div')
  sigDots1.textContent = '................................................'
  sigDots1.style.cssText = 'margin-top:24px;'
  const sigName1 = document.createElement('div')
  sigName1.textContent = `(${data.studentName || '...............................................'})`
  sigBlock.appendChild(sigLabel1)
  sigBlock.appendChild(sigDots1)
  sigBlock.appendChild(sigName1)
  sigWrap.appendChild(sigBlock)
  page.appendChild(sigWrap)

  const instructorNote = document.createElement('p')
  instructorNote.style.cssText = 'font-size:14px;margin-top:24px;'
  instructorNote.textContent = 'อาจารย์ประจำวิชาขอรับรองว่าใช้เพื่อวัตถุประสงค์ข้างต้นจริง'
  page.appendChild(instructorNote)

  const sigWrap2 = document.createElement('div')
  sigWrap2.style.cssText = 'margin-top:36px;font-size:14px;'
  const sigDots2 = document.createElement('div')
  sigDots2.textContent = '.................................................'
  const sigName2 = document.createElement('div')
  sigName2.textContent = `(${data.instructorName || '...............................................'})`
  const sigLabel2 = document.createElement('div')
  sigLabel2.textContent = 'อาจารย์ประจำวิชาผู้รับรอง'
  sigLabel2.style.cssText = 'margin-top:4px;'
  sigWrap2.appendChild(sigDots2)
  sigWrap2.appendChild(sigName2)
  sigWrap2.appendChild(sigLabel2)
  page.appendChild(sigWrap2)

  const footNote = document.createElement('p')
  footNote.style.cssText = 'font-size:13px;font-weight:600;margin-top:32px;'
  footNote.textContent =
    '*หมายเหตุ* หากอาจารย์ประจำวิชาผู้รับรองอนุญาตให้ใช้ห้องหลังเวลาราชการ (ตั้งแต่ 16.30 - 20.30 น.) ' +
    'ต้องเป็นผู้ดูแลรับผิดชอบในอุปกรณ์ และการเปิด – ปิดห้องด้วยตนเอง'
  page.appendChild(footNote)

  return page
}
```

- [ ] **Step 3: Create the PDF generator**

Create `src/lib/pdf/generateBookingPdf.ts`:

```ts
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { parseDate, TH_MONTHS } from '../../utils/datetime'
import { buildBookingFormElement } from './bookingFormTemplate'
import type { Booking, Room } from '../../types'

export async function downloadBookingPdf(booking: Booking, room: Room): Promise<void> {
  const d = parseDate(booking.date)

  const el = buildBookingFormElement({
    refCode: booking.bookingCode,
    studentName: booking.requester,
    studentId: booking.studentId,
    major: booking.major,
    year: booking.year,
    phone: booking.phone,
    roomName: room.name,
    purpose: booking.purpose,
    courseCode: booking.courseCode,
    courseName: booking.title,
    courseGroup: booking.courseGroup,
    day: String(d.getDate()),
    month: TH_MONTHS[d.getMonth()],
    yearBE: String(d.getFullYear() + 543),
    startTime: booking.start,
    endTime: booking.end,
    instructorName: booking.instructorName,
  })

  document.body.appendChild(el)
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`booking-form-${booking.bookingCode || booking.id}.pdf`)
  } finally {
    document.body.removeChild(el)
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/pdf/bookingFormTemplate.ts src/lib/pdf/generateBookingPdf.ts
git commit -m "feat(booking): add HTML-to-PDF generator for room-request memo"
```

---

### Task 3: Wire the download button into the booking detail modal

**Files:**
- Modify: `src/components/modals/BookingDetailModal.tsx:1-8` (imports), `:52-70` (props/hook), `:170-185` (booking-code chip area)
- Modify: `src/App.tsx:451-466` (`BookingDetailModal` invocation)

**Interfaces:**
- Consumes: `downloadBookingPdf(booking: Booking, room: Room): Promise<void>` from Task 2.

- [ ] **Step 1: Add the `onError` prop and imports**

Edit `src/components/modals/BookingDetailModal.tsx`. Update the icon import (currently line 2):

```ts
import { X, CalendarDays, Clock, MapPin, Users, AlertTriangle, Check, Trash2, CalendarPlus, ExternalLink, ScanLine, FileDown } from 'lucide-react'
```

Add below the existing imports (after the `googleCalUrl` function, before `interface BookingDetailModalProps`):

```ts
import { downloadBookingPdf } from '../../lib/pdf/generateBookingPdf'
```

Update `BookingDetailModalProps` (currently lines 52-58) to add `onError`:

```ts
interface BookingDetailModalProps {
  booking: Booking
  role: 'requester' | 'approver'
  onClose: () => void
  onDecide: (id: string, status: Status, note: string) => void
  onRemove: (id: string) => void
  onError: (msg: string) => void
}
```

Update the component signature (currently lines 60-66) to destructure `onError`:

```ts
export default function BookingDetailModal({
  booking: b,
  role,
  onClose,
  onDecide,
  onRemove,
  onError,
}: BookingDetailModalProps) {
```

- [ ] **Step 2: Add the download handler**

Inside the component, after the existing `const [deleteConfirm, setDeleteConfirm] = useState(false)` line (currently line 69), add:

```ts
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  async function handleDownloadPdf() {
    const room = rooms.find((r) => r.id === b.roomId)
    if (!room) { onError('ไม่พบข้อมูลห้อง'); return }
    setDownloadingPdf(true)
    try {
      await downloadBookingPdf(b, room)
    } catch (err) {
      console.error('[downloadBookingPdf]', err)
      onError('สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setDownloadingPdf(false)
    }
  }
```

- [ ] **Step 3: Add the button**

Edit the JSX, inserting right after the `bookingCode` chip block (currently lines 172-182, the `{b.bookingCode && (...)}` block) and before the QR code block:

```tsx
          {b.bookingCode && (
            <button
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-buu-subtle hover:text-buu transition disabled:opacity-60 w-full justify-center"
            >
              <FileDown size={13} aria-hidden="true" />
              {downloadingPdf ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF (แบบฟอร์มขอใช้ห้อง)'}
            </button>
          )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: FAIL — `src/App.tsx` will error because `BookingDetailModal` now requires `onError` but the call site doesn't pass it yet. This is expected, fixed in the next step.

- [ ] **Step 5: Wire `onError` from `App.tsx`**

Edit `src/App.tsx`. Update the `BookingDetailModal` invocation (currently lines 452-466):

```tsx
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          role={role}
          onClose={() => setSelectedBooking(null)}
          onDecide={async (id, status, note) => {
            await handleDecide(id, status, note)
            setSelectedBooking(null)
          }}
          onRemove={async (id) => {
            await handleRemove(id)
            setSelectedBooking(null)
          }}
          onError={(msg) => flash(msg, 'error')}
        />
      )}
```

- [ ] **Step 6: Type-check, expect PASS**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: PASS (0 errors).

- [ ] **Step 7: Full production build**

Run: `npm run build`

Expected: succeeds, producing `dist/`.

- [ ] **Step 8: Manual end-to-end verification**

Run: `npm run dev`

In the browser:
1. As requester, create a booking with Thai text in fields known to stress vowel/tone-mark shaping (studentName `ณัฐพงษ์ ก้าวหน้า`, major `การจัดการโลจิสติกส์`, purpose `เพื่อจัดประชุมกลุ่ม`, courseName/title `การจัดการโซ่อุปทานระหว่างประเทศ`).
2. Open the booking's detail view. Confirm the "ดาวน์โหลด PDF" button is visible.
3. Click it. Confirm a file named `booking-form-<bookingCode>.pdf` downloads with no console errors.
4. Open the downloaded PDF. Confirm:
   - All Thai text renders correctly (no broken vowel/tone-mark combinations, no tofu boxes).
   - The ref line at the top shows the same code as the "รหัสการจอง" chip in the app.
   - The layout is a reasonable match to `FORM-นิสิตขอใช้ห้องอาคารคณะโลจิสติกส์.pdf` (header, ที่/เรื่อง/เรียน block, filled-in blanks, signature area, หมายเหตุ footer).
5. Repeat as an approver viewing a pending booking — confirm the button also works from that role.

- [ ] **Step 9: Commit**

```bash
git add src/components/modals/BookingDetailModal.tsx src/App.tsx
git commit -m "feat(booking): add PDF download button to booking detail modal"
```
