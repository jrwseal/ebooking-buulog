# Design: Room Overview View (ภาพรวม)

## Motivation

User wants a page styled like the physical room-log paper form: rooms as rows, เช้า/บ่าย/เย็น (morning/afternoon/evening) as columns, one day at a time. The existing app only has timeline-style views (`DayView`, `WeekView` via `ScheduleGrid`) where rooms/days are columns and hour is a vertical pixel position. This adds a compact spreadsheet-style alternative.

## Scope

New view only. Does not touch booking creation/approval logic, schema, or existing views.

## Behavior

- **Date-based, not a static weekday template.** This is a single-date picker (prev/today/next, same as `DayView`), not a fixed Tuesday-only timetable independent of calendar date. Each date shows whatever `bookings` rows exist for that date.
- **Columns:** 3 fixed periods spanning `START_H`–`END_H` (08:00–20:00) evenly:
  - เช้า 08:00–12:00
  - บ่าย 12:00–16:00
  - เย็น 16:00–20:00
- **Rows:** always all rooms from `useStore().rooms`, in store order. The existing room-filter dropdown (above the view tabs) does not apply to this view — empty rooms still render as blank rows, matching the paper form.
- **Bucketing rule:** a booking is placed in the period matching its **start time** (e.g. 13:00–17:00 → บ่าย only, not duplicated into เย็น). The chip inside the cell shows the real time range (`13:00–17:00`) so no information is lost — it's just filed under its start period, same as the reference photo (room 304's 13:00–17:00 entry sits only in บ่าย).
- **Rejected bookings hidden**, consistent with other views.
- **Cell content:**
  - Empty cell → clickable, opens booking form (`onBookRoom(date, roomId, periodStartHour)`) with hour defaulted to the period's start hour (8 / 12 / 16).
  - One or more bookings → stacked small chips, status-colored using the existing `STATUS` palette (`src/utils/datetime.ts`). Chip text = title/teacher + time range. For `role === 'requester'`, chip text is masked to "จองแล้ว" (matches `maskDetails` behavior in `ScheduleGrid`/`DayView`).
  - Click a chip → opens `BookingDetailModal` via `onOpenDetail`, same wiring as `DayView`.

## Component

- New file: `src/components/views/OverviewView.tsx`
- Plain HTML `<table>` layout (sticky first column for room name), not `ScheduleGrid` — intentionally a distinct compact/spreadsheet look vs. the timeline views.
- Reuses `Legend` component below the table.
- Props mirror `DayView`: `selectedDate`, `setSelectedDate`, `role`, `onBookRoom`, `onOpenDetail` (no `roomFilter` prop needed since rows always show all rooms).

## Integration in `App.tsx`

- New `ViewMode` value `'overview'`.
- New tab button between "วัน" and "สัปดาห์": icon `Table2` (lucide-react), label "ภาพรวม".
- Rendered the same way as other views, wired to existing `openBooking`/`openDetail` handlers — no new state needed in `App.tsx` beyond the view switch.

## Data model check (verified)

The admin "ตารางสอน" (teacher schedule / recurring) flow (`BookingModal` `adminMode`) already writes **one `bookings` row per date** (`addSchedule`/`addSchedules`, weekly loop over `date`), so a date-keyed grid correctly finds recurring teacher schedule entries without any data-layer change.

## Out of scope / explicitly not doing

- No new Supabase schema or columns.
- No change to conflict-checking or approval logic.
- No printable/export mode for this view (can be a future feature idea if requested).
