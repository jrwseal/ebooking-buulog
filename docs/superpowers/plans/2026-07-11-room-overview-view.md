# Room Overview View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "ภาพรวม" (Overview) view — a spreadsheet-style table with rooms as rows and เช้า/บ่าย/เย็น (morning/afternoon/evening) as fixed columns for one calendar date, mirroring the paper room-log format the user showed.

**Architecture:** One new presentational component (`OverviewView.tsx`) that reads `rooms`/`bookings` from the existing Zustand store and reuses the existing `Booking`/`Room` types, `STATUS` palette, and date-formatting utils. `App.tsx` gets a new tab and a `ViewMode` value wired to the same `openBooking`/`openDetail` handlers already used by `DayView`. No schema change, no new store methods.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 (OKLCH design tokens), Zustand, lucide-react icons, Vite.

## Global Constraints

- No test framework exists in this repo (no Jest/Vitest, no `*.test.*` files, no test script in `package.json`). Verification for every task is `npm run build` (runs `tsc -b && vite build`, which fails on type errors) plus a manual check in the browser via `npm run dev` — not automated tests. Do not add a test framework as part of this feature.
- All UI copy is Thai, matching existing labels exactly in tone/register (e.g. "วันนี้", "จองแล้ว", "ห้อง").
- Never use hard-coded hex colors — reuse existing Tailwind/OKLCH tokens already in the codebase (`bg-buu`, `text-buu`, `border-buu-subtle`, `bg-slate-*`, `STATUS[...].chip`), consistent with commit `5e8023c` ("replace all hard-coded hex colors with OKLCH design tokens").
- Touch targets: interactive elements should keep `min-h-[44px] sm:min-h-0` where the codebase already applies it for tap targets (see `ScheduleGrid.tsx`, `DayView.tsx`).
- Follow the existing per-file pattern of small local helper components (e.g. `DayView.tsx` defines its own local `NavBtn`) rather than extracting a shared one.

---

### Task 1: Create `OverviewView` component

**Files:**
- Create: `src/components/views/OverviewView.tsx`

**Interfaces:**
- Consumes: `useStore()` → `{ rooms: Room[], bookings: Booking[], loading: boolean }` from `src/store/useStore.ts`; `STATUS`, `TH_DAYS_FULL`, `fmtDate`, `thaiFull`, `todayStr`, `parseDate`, `toMin`, `pad` from `src/utils/datetime.ts`; `Legend` (default export) from `src/components/Legend.tsx`; `Booking` type from `src/types`.
- Produces: default export `OverviewView(props: OverviewViewProps)` where
  ```ts
  interface OverviewViewProps {
    selectedDate: string
    setSelectedDate: (s: string) => void
    role: 'requester' | 'approver'
    onBookRoom: (dateStr: string, roomId: string | null, hour: number) => void
    onOpenDetail: (b: Booking) => void
  }
  ```
  This signature matches `DayView`'s props (minus `roomFilter`, which this view intentionally ignores) so `App.tsx` can wire it with the same `openBooking`/`openDetail` callbacks.

- [ ] **Step 1: Write the component file**

```tsx
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { STATUS, TH_DAYS_FULL, fmtDate, thaiFull, todayStr, parseDate, toMin, pad } from '../../utils/datetime'
import Legend from '../Legend'
import type { Booking } from '../../types'

interface OverviewViewProps {
  selectedDate: string
  setSelectedDate: (s: string) => void
  role: 'requester' | 'approver'
  onBookRoom: (dateStr: string, roomId: string | null, hour: number) => void
  onOpenDetail: (b: Booking) => void
}

interface Period {
  key: string
  label: string
  startH: number
  endH: number
}

const PERIODS: Period[] = [
  { key: 'morning', label: 'เช้า', startH: 8, endH: 12 },
  { key: 'afternoon', label: 'บ่าย', startH: 12, endH: 16 },
  { key: 'evening', label: 'เย็น', startH: 16, endH: 20 },
]

// Buckets a booking into the period containing its start time; clamps
// out-of-range starts (shouldn't happen given the 08:00-20:00 booking UI,
// but keeps the grid exhaustive) to the first/last period.
function periodForStart(startMin: number): Period {
  for (const p of PERIODS) {
    if (startMin < p.endH * 60) return p
  }
  return PERIODS[PERIODS.length - 1]
}

export default function OverviewView({
  selectedDate,
  setSelectedDate,
  role,
  onBookRoom,
  onOpenDetail,
}: OverviewViewProps) {
  const { rooms, bookings, loading } = useStore()

  const dDate = useMemo(() => parseDate(selectedDate), [selectedDate])

  const rows = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        periods: PERIODS.map((period) => ({
          period,
          items: bookings
            .filter(
              (b) =>
                b.roomId === room.id &&
                b.date === selectedDate &&
                b.status !== 'rejected' &&
                periodForStart(toMin(b.start)).key === period.key,
            )
            .sort((a, b) => toMin(a.start) - toMin(b.start)),
        })),
      })),
    [rooms, bookings, selectedDate],
  )

  function shiftDay(n: number) {
    const d = parseDate(selectedDate)
    d.setDate(d.getDate() + n)
    setSelectedDate(fmtDate(d))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-bold">
          วัน{TH_DAYS_FULL[dDate.getDay()]} {thaiFull(selectedDate)}
        </h2>
        <div className="flex items-center gap-1">
          <NavBtn aria-label="วันก่อน" onClick={() => shiftDay(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </NavBtn>
          <button
            onClick={() => setSelectedDate(todayStr)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600"
          >
            วันนี้
          </button>
          <NavBtn aria-label="วันถัดไป" onClick={() => shiftDay(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </NavBtn>
        </div>
      </div>

      {loading && rooms.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
          <Loader2 size={18} className="motion-safe:animate-spin" /> กำลังโหลดห้อง…
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 text-left px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100 w-32">
                    ห้อง
                  </th>
                  {PERIODS.map((p) => (
                    <th
                      key={p.key}
                      className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-l border-slate-100 text-center"
                    >
                      {p.label}
                      <span className="block font-normal text-slate-400">
                        {pad(p.startH)}:00–{pad(p.endH)}:00
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ room, periods }) => (
                  <tr key={room.id} className="border-b border-slate-100 align-top">
                    <th
                      scope="row"
                      className="sticky left-0 bg-white text-left px-3 py-2 font-medium text-slate-700 w-32"
                    >
                      {room.name}
                      <span className="block text-[11px] font-normal text-slate-400">{room.type}</span>
                    </th>
                    {periods.map(({ period, items }) => (
                      <td key={period.key} className="border-l border-slate-100 px-1.5 py-1.5 align-top">
                        {items.length === 0 ? (
                          <button
                            onClick={() => onBookRoom(selectedDate, room.id, period.startH)}
                            className="w-full h-10 rounded-md border border-dashed border-slate-200 text-slate-300 hover:border-buu-subtle hover:text-buu transition text-xs"
                            aria-label={`จอง ${room.name} ช่วง${period.label}`}
                          >
                            +
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {items.map((b) => (
                              <button
                                key={b.id}
                                onClick={() => onOpenDetail(b)}
                                className={`w-full text-left rounded border px-1.5 py-1 text-[11px] leading-tight min-h-[44px] sm:min-h-0 ${STATUS[b.status].chip}`}
                              >
                                <div className="font-semibold truncate">
                                  {role === 'requester' ? 'จองแล้ว' : b.title}
                                </div>
                                <div className="opacity-80 truncate">
                                  {b.start}–{b.end}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
        </>
      )}
    </div>
  )
}

function NavBtn({ onClick, children, 'aria-label': ariaLabel }: { onClick: () => void; children: React.ReactNode; 'aria-label'?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600"
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 2: Type-check the new file in isolation**

Run: `npm run build`
Expected: build succeeds (exit code 0). If it fails, the error will point at `OverviewView.tsx` — it isn't imported anywhere yet, so the only possible failures are within this file (typos, wrong import paths/names). Fix and rerun until it passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/OverviewView.tsx
git commit -m "feat(booking): add room overview table view (rooms x เช้า/บ่าย/เย็น)"
```

---

### Task 2: Wire `OverviewView` into `App.tsx`

**Files:**
- Modify: `src/App.tsx:1-7` (icon imports), `:24` (`ViewMode` type), `:276` (keyboard-nav `modes` array), `:282` (tab buttons), `:401-412` (view panels)

**Interfaces:**
- Consumes: `OverviewView` default export and `OverviewViewProps` from Task 1 (`src/components/views/OverviewView.tsx`).
- Produces: nothing new consumed by later tasks — this is the final integration point.

- [ ] **Step 1: Add the `Table2` icon to the existing lucide-react import**

In `src/App.tsx`, current block (lines 2-7):

```tsx
import {
  Plus, Lock, LogOut, KeyRound,
  LayoutGrid, CalendarRange, CalendarDays, List, User,
  CheckCircle2, Hourglass, MapPin, X,
  ClipboardCheck, Trash2, DoorOpen, ChevronDown, GraduationCap, ScanLine,
} from 'lucide-react'
```

Change to:

```tsx
import {
  Plus, Lock, LogOut, KeyRound,
  LayoutGrid, CalendarRange, CalendarDays, List, User,
  CheckCircle2, Hourglass, MapPin, X,
  ClipboardCheck, Trash2, DoorOpen, ChevronDown, GraduationCap, ScanLine, Table2,
} from 'lucide-react'
```

- [ ] **Step 2: Import `OverviewView`**

Directly below the existing view imports (after `import MonthView from './components/views/MonthView'` and before/after its neighbors — keep the existing `MonthView`/`WeekView`/`DayView`/`AgendaView`/`MyBookingsView` block together, e.g. right after `DayView`):

```tsx
import DayView from './components/views/DayView'
import OverviewView from './components/views/OverviewView'
```

- [ ] **Step 3: Add `'overview'` to the `ViewMode` type**

Current (line 24):

```tsx
type ViewMode = 'month' | 'week' | 'day' | 'agenda' | 'mine'
```

Change to:

```tsx
type ViewMode = 'month' | 'week' | 'day' | 'overview' | 'agenda' | 'mine'
```

- [ ] **Step 4: Add `'overview'` to the keyboard-nav `modes` array**

Current (inside the `role="tablist"` div's `onKeyDown`, ~line 276):

```tsx
const modes: ViewMode[] = ['day', 'week', 'month', 'agenda', 'mine']
```

Change to:

```tsx
const modes: ViewMode[] = ['day', 'overview', 'week', 'month', 'agenda', 'mine']
```

- [ ] **Step 5: Add the Overview tab button**

Current (~lines 282-286):

```tsx
<ToolTab id="tab-day" controls="panel-day" active={view === 'day'} onClick={() => setView('day')} icon={<CalendarDays size={15} aria-hidden="true" />} label="วัน" />
<ToolTab id="tab-week" controls="panel-week" active={view === 'week'} onClick={() => setView('week')} icon={<CalendarRange size={15} aria-hidden="true" />} label="สัปดาห์" />
```

Insert a new `ToolTab` between them:

```tsx
<ToolTab id="tab-day" controls="panel-day" active={view === 'day'} onClick={() => setView('day')} icon={<CalendarDays size={15} aria-hidden="true" />} label="วัน" />
<ToolTab id="tab-overview" controls="panel-overview" active={view === 'overview'} onClick={() => setView('overview')} icon={<Table2 size={15} aria-hidden="true" />} label="ภาพรวม" />
<ToolTab id="tab-week" controls="panel-week" active={view === 'week'} onClick={() => setView('week')} icon={<CalendarRange size={15} aria-hidden="true" />} label="สัปดาห์" />
```

- [ ] **Step 6: Render the `OverviewView` panel**

Current (~lines 401-412), the Day panel block followed directly by the Agenda panel block:

```tsx
        {view === 'day' && (
          <div id="panel-day" role="tabpanel" aria-labelledby="tab-day">
            <DayView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              roomFilter={roomFilter}
              onBookRoom={openBooking}
              onOpenDetail={openDetail}
            />
          </div>
        )}
        {view === 'agenda' && (
```

Insert a new panel block between them:

```tsx
        {view === 'day' && (
          <div id="panel-day" role="tabpanel" aria-labelledby="tab-day">
            <DayView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              roomFilter={roomFilter}
              onBookRoom={openBooking}
              onOpenDetail={openDetail}
            />
          </div>
        )}
        {view === 'overview' && (
          <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
            <OverviewView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              onBookRoom={openBooking}
              onOpenDetail={openDetail}
            />
          </div>
        )}
        {view === 'agenda' && (
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 8: Manual verification in the browser**

Run: `npm run dev`, open the printed local URL.

1. Click the "ภาพรวม" tab (between "วัน" and "สัปดาห์"). Confirm a table renders with one row per room (labels + type/capacity subtext) and 3 header columns: เช้า (08:00–20:00 sub-range 08:00–12:00), บ่าย (12:00–16:00), เย็น (16:00–20:00).
2. Confirm date header shows the currently selected day and prev/today/next buttons shift the date, matching `DayView` behavior.
3. Click an empty cell in the เช้า column for any room. Confirm the booking modal opens pre-filled with that room and a start time of `08:00`. Repeat for a บ่าย cell (expect `12:00`) and เย็น cell (expect `16:00`).
4. Submit a test booking in the เช้า column with start `09:00`, end `10:00`. Confirm a chip appears in the เช้า cell for that room showing the title and `09:00–10:00`.
5. Submit a second test booking in the same room with start `13:00`, end `17:00`. Confirm the chip appears only in the บ่าย column (not duplicated into เย็น), showing `13:00–17:00`.
6. Click the chip. Confirm the existing `BookingDetailModal` opens with the correct booking's details.
7. Switch role to "ผู้จอง" (requester, no login needed). Confirm both chips now show "จองแล้ว" instead of the real title (masking matches `DayView`'s `maskDetails` behavior).
8. Resize the browser to a narrow (mobile) width. Confirm the table scrolls horizontally without breaking the page layout, and the room column stays visible (sticky) while scrolling.
9. Clean up: switch back to "ผู้อนุมัติ", open each test booking's detail modal, delete both test bookings.

If any check fails, fix the relevant code in `OverviewView.tsx` or `App.tsx` and repeat from Step 7.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat(booking): wire overview view into tab bar"
```
