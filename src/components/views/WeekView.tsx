import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/useStore'
import {
  TH_DAYS, TH_MONTHS, fmtDate, todayStr, parseDate, weekDays,
} from '../../utils/datetime'
import ScheduleGrid from '../ScheduleGrid'
import Legend from '../Legend'
import type { Booking } from '../../types'

interface WeekViewProps {
  selectedDate: string
  setSelectedDate: (s: string) => void
  role: 'requester' | 'approver'
  onBookRoom: (dateStr: string, roomId: string | null, hour: number) => void
  onOpenDetail: (b: Booking) => void
}

export default function WeekView({
  selectedDate,
  setSelectedDate,
  role,
  onBookRoom,
  onOpenDetail,
}: WeekViewProps) {
  const { rooms, bookings } = useStore()
  const [roomFilter, setRoomFilter] = useState('all')

  const wDays = useMemo(() => weekDays(selectedDate), [selectedDate])

  const weekLabel = useMemo(() => {
    const s = wDays[0]
    const e = wDays[6]
    return `${s.getDate()} ${TH_MONTHS[s.getMonth()]} – ${e.getDate()} ${TH_MONTHS[e.getMonth()]} ${e.getFullYear() + 543}`
  }, [wDays])

  const columns = useMemo(
    () =>
      wDays.map((d, i) => {
        const ds = fmtDate(d)
        return {
          key: ds,
          label: TH_DAYS[i],
          sublabel: String(d.getDate()),
          isToday: ds === todayStr,
          dateStr: ds,
          roomId: roomFilter !== 'all' ? roomFilter : null,
          items: bookings.filter(
            (b) =>
              b.date === ds &&
              b.status !== 'rejected' &&
              (roomFilter === 'all' || b.roomId === roomFilter),
          ),
        }
      }),
    [wDays, roomFilter, bookings],
  )

  function shiftWeek(n: number) {
    const d = parseDate(selectedDate)
    d.setDate(d.getDate() + n)
    setSelectedDate(fmtDate(d))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <h2 className="font-bold">{weekLabel}</h2>
        <div className="flex items-center gap-2">
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-[#1b3a6b]"
          >
            <option value="all">ทุกห้อง</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <NavBtn onClick={() => shiftWeek(-7)}>
              <ChevronLeft size={18} />
            </NavBtn>
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600"
            >
              สัปดาห์นี้
            </button>
            <NavBtn onClick={() => shiftWeek(7)}>
              <ChevronRight size={18} />
            </NavBtn>
          </div>
        </div>
      </div>

      {/* Day-of-week labels (tappable to jump) */}
      <div className="flex border-b border-slate-100 overflow-x-auto">
        <div className="w-11 shrink-0" />
        {wDays.map((d, i) => {
          const ds = fmtDate(d)
          const isToday = ds === todayStr
          const isSel = ds === selectedDate
          return (
            <button
              key={ds}
              onClick={() => setSelectedDate(ds)}
              className={`w-28 sm:w-36 shrink-0 py-1.5 text-center border-l border-slate-100 text-xs transition hover:bg-slate-50 ${
                isToday ? 'bg-[#eef2f9]' : ''
              } ${isSel ? 'ring-1 ring-inset ring-[#4a72b0]' : ''}`}
            >
              <span className={`font-semibold ${isToday ? 'text-[#1b3a6b]' : 'text-slate-600'}`}>
                {TH_DAYS[i]}
              </span>
              <span className="text-slate-400 ml-1">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      <ScheduleGrid
        columns={columns}
        showRoom={roomFilter === 'all'}
        maskDetails={role === 'requester'}
        onSelect={onOpenDetail}
        onCreate={onBookRoom}
      />
      <Legend />
    </div>
  )
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600"
    >
      {children}
    </button>
  )
}

