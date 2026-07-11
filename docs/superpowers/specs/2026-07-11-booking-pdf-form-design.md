# Design — Generate official room-request PDF + tracking ref number

Date: 2026-07-11

## Problem

When a student books a room, the faculty requires the official paper form
(`FORM-นิสิตขอใช้ห้องอาคารคณะโลจิสติกส์.pdf` — a "บันทึกข้อความ" memo) filled
out and signed (student → instructor countersign → dean). Today the app
captures only a subset of what that form needs (title, requester, email,
purpose, date/time). Students have to re-type everything from scratch onto
the paper form by hand.

Goal: when a student submits a booking, capture the fields the official form
needs, and let them generate a filled PDF version of that form from the
booking record — with a reference number they (and staff) can use to track
status afterward.

## Scope

Applies to the **student/requester booking flow only** (`BookingModal` with
`adminMode = false`). Admin-created faculty teaching schedules
(`adminMode = true`, recurring weekly classes) are a different workflow with
no student endorsement step — left untouched.

## Data model

Extend `Booking` / `BookingInput` (`src/types/index.ts`) with 7 new optional
string fields, all mapped from the PDF's blanks that the current model
doesn't already cover:

| App field        | PDF blank                          |
|-------------------|-------------------------------------|
| `studentId`       | รหัสนิสิต                            |
| `major`           | สาขาวิชา/แขนงวิชา                     |
| `year`            | ชั้นปีที่                             |
| `phone`           | เบอร์โทรศัพท์                        |
| `courseCode`      | รหัสวิชา                             |
| `courseGroup`     | กลุ่ม                                |
| `instructorName`  | อาจารย์ประจำวิชาผู้รับรอง (optional)  |

Fields already covering a PDF blank — reused as-is, not duplicated:

| App field  | PDF blank                          |
|------------|-------------------------------------|
| `requester`| ชื่อ...นิสิตผู้ขอใช้ห้อง               |
| `title`    | ชื่อวิชา                             |
| `roomId`   | มีความประสงค์ขอใช้ห้อง...             |
| `purpose`  | เพื่อ...                             |
| `date`/`start`/`end` | วันที่...เวลา... ถึงวันที่...เวลา... (single-day booking — form's start/end date both render as the same `date`) |
| `bookingCode` | printed on the PDF as the tracking ref number (no new sequence/counter — reuses the existing random `LOG-XXXXXX` code already generated on insert and already surfaced in `BookingDetailModal` / `MyBookingsView`) |

Supabase `bookings` table gets 7 new nullable text columns (default `''`),
following the existing alter-table comment pattern in `supabase/schema.sql`:
`student_id, major, year_level, phone, course_code, course_group,
instructor_name`.

## Form changes (`BookingModal.tsx`)

New inputs added to the non-admin path only, required except
`instructorName`:

- ข้อมูลนิสิต: รหัสนิสิต, สาขาวิชา/แขนงวิชา, ชั้นปีที่, เบอร์โทรศัพท์
- ข้อมูลรายวิชา: รหัสวิชา, กลุ่ม
- อาจารย์ประจำวิชาผู้รับรอง (ถ้ามี) — optional; the physical form still needs
  a real signature, this just lets the name be pre-printed

`handleSubmit` validation extended: for `!adminMode`, all of the above
except `instructorName` must be non-empty (mirrors the existing
title/requester/email checks already there).

## PDF generation

**Rejected approach:** overlaying text onto the original scanned PDF via
`pdf-lib` + an embedded Thai font. Spiked and confirmed broken — `pdf-lib`/
`fontkit` have no GSUB/GPOS shaping engine, so Thai vowel+tone-mark
combinations render incorrectly (e.g. "เพื่อ" came out as "เพี่ อ" with a
stray gap) wherever a name, course title, or purpose field happens to
contain them. Unacceptable for an official document. Also ruled out: forcing
`window.print()` — correct (vector) output but requires the user to manually
pick "Save as PDF" from a browser dialog every time, breaking the
one-click-download pattern the rest of the app already uses (`.ics` export).

**Chosen approach:** render an HTML replica of the memo off-screen, let the
browser do correct Thai text shaping, screenshot it with `html2canvas`, and
embed that image into a single-page `jsPDF` document sized to A4. Output is
a raster image inside the PDF (not selectable/searchable text, slightly
softer at high zoom) — acceptable trade-off for correctness. This mirrors
the existing pure-function export style already in `BookingDetailModal.tsx`
(`downloadIcs`), not a new architectural pattern.

New files:

- `src/lib/pdf/bookingFormTemplate.ts` — builds a detached DOM node styled
  to resemble the official memo layout (BUU header/logo, ที่/เรื่อง/เรียน
  boilerplate text, blanks filled from the booking + room + ref number).
- `src/lib/pdf/generateBookingPdf.ts` — exports
  `downloadBookingPdf(booking, room)`: appends the template node to
  `document.body` (positioned off-screen), captures it with `html2canvas`,
  embeds the resulting image into an A4 `jsPDF` page, triggers download as
  `booking-form-${booking.bookingCode}.pdf`, then removes the temporary
  node.

New dependencies: `html2canvas`, `jspdf` (both pure client-side, no native
deps, standard Vite-compatible).

## Trigger

A "ดาวน์โหลด PDF" button in `BookingDetailModal.tsx`, placed next to the
existing `.ics` / Google Calendar buttons. Shown for any booking status
(not just `approved`) since students need the form printed and signed
*before* the dean approves it — this is the request paperwork itself, not a
post-approval artifact.

## Error handling

`html2canvas`/`jsPDF` failures (e.g. font not yet loaded, canvas taint) are
caught and surface the existing toast pattern (`onError`/`flash`) already
used for other actions in this modal — no new error UI needed.

## Testing

Manual verification only (no automated test harness in this repo currently):
submit a student booking with Thai text that includes vowel+tone-mark
combinations in name/course fields, click Download PDF, open the result, and
visually confirm text renders correctly and the layout is a reasonable
match to the official form.
