import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { TH_DAYS_FULL, fmtDate, thaiFull, todayStr, parseDate } from '../../utils/datetime'
import ScheduleGrid from '../ScheduleGrid'
import Legend from '../Legend'
import type { Booking } from '../../types'

interface DayViewProps {
  selectedDate: string
  setSelectedDate: (s: string) => void
  role: 'requester' | 'approver'
  roomFilter: string
  onBookRoom: (dateStr: string, roomId: string | null, hour: number) => void
  onOpenDetail: (b: Booking) => void
}

export default function DayView({
  selectedDate,
  setSelectedDate,
  role,
  roomFilter,
  onBookRoom,
  onOpenDetail,
}: DayViewProps) {
  const { rooms, bookings, loading } = useStore()

  const dDate = useMemo(() => parseDate(selectedDate), [selectedDate])

  const columns = useMemo(() => {
    const filtered = roomFilter !== 'all' ? rooms.filter((r) => r.id === roomFilter) : rooms
    return filtered.map((r) => ({
      key: r.id,
      label: r.id.replace('LOG-', ''),
      sublabel: `${r.type} · ${r.capacity}`,
      isToday: selectedDate === todayStr,
      dateStr: selectedDate,
      roomId: r.id,
      items: bookings.filter(
        (b) => b.date === selectedDate && b.status !== 'rejected' && b.roomId === r.id,
      ),
    }))
  }, [rooms, bookings, selectedDate, roomFilter])

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
          <NavBtn onClick={() => shiftDay(-1)}>
            <ChevronLeft size={18} />
          </NavBtn>
          <button
            onClick={() => setSelectedDate(todayStr)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600"
          >
            วันนี้
          </button>
          <NavBtn onClick={() => shiftDay(1)}>
            <ChevronRight size={18} />
          </NavBtn>
        </div>
      </div>

      {loading && rooms.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
          <Loader2 size={18} className="motion-safe:animate-spin" /> กำลังโหลดห้อง…
        </div>
      ) : (
        <>
          <ScheduleGrid
            columns={columns}
            showRoom={false}
            maskDetails={role === 'requester'}
            onSelect={onOpenDetail}
            onCreate={onBookRoom}
          />
          <Legend />
        </>
      )}
    </div>
  )
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600"
    >
      {children}
    </button>
  )
}
