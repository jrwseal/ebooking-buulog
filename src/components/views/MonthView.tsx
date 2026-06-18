import { useMemo } from 'react'
import { CalendarDays, Calendar, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { STATUS, TH_DAYS, TH_MONTHS, fmtDate, todayStr, toMin, thaiFull, buildMonth } from '../../utils/datetime'
import Legend from '../Legend'
import type { Booking } from '../../types'

interface MonthViewProps {
  cursor: Date
  setCursor: (d: Date) => void
  selectedDate: string
  setSelectedDate: (s: string) => void
  role: 'requester' | 'approver'
  onSwitchToDayView: () => void
  onBookRoom: (date: string) => void
}

export default function MonthView({
  cursor,
  setCursor,
  selectedDate,
  setSelectedDate,
  role,
  onSwitchToDayView,
  onBookRoom,
}: MonthViewProps) {
  const { bookings, rooms } = useStore()

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id

  const byDate = useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of bookings) {
      if (!map[b.date]) map[b.date] = []
      map[b.date].push(b)
    }
    for (const k in map) map[k].sort((a, b) => toMin(a.start) - toMin(b.start))
    return map
  }, [bookings])

  const months = buildMonth(cursor)
  const dayList = byDate[selectedDate] ?? []

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Calendar grid */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-bold">
            {TH_MONTHS[cursor.getMonth()]} {cursor.getFullYear() + 543}
          </h2>
          <div className="flex items-center gap-1">
            <NavBtn onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft size={18} />
            </NavBtn>
            <button
              onClick={() => { setCursor(new Date()); setSelectedDate(todayStr) }}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600"
            >
              วันนี้
            </button>
            <NavBtn onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight size={18} />
            </NavBtn>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-400 border-b border-slate-100">
          {TH_DAYS.map((d, i) => (
            <div key={d} className={`py-2 ${i === 0 || i === 6 ? 'text-rose-400' : ''}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {months.map((d, i) => {
            const ds = fmtDate(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const items = byDate[ds] ?? []
            const isToday = ds === todayStr
            const isSel = ds === selectedDate
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(ds)}
                onDoubleClick={() => { setSelectedDate(ds); onSwitchToDayView() }}
                className={[
                  'min-h-[78px] sm:min-h-[92px] text-left p-1.5 border-b border-r border-slate-100 transition',
                  inMonth ? '' : 'bg-slate-50/60',
                  isSel ? 'ring-2 ring-inset ring-[#2a5298]' : 'hover:bg-[#eef2f9]/40',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={[
                      'text-xs w-5 h-5 flex items-center justify-center rounded-full',
                      isToday
                        ? 'bg-[#1b3a6b] text-white font-bold'
                        : inMonth
                        ? 'text-slate-600'
                        : 'text-slate-300',
                    ].join(' ')}
                  >
                    {d.getDate()}
                  </span>
                  {/* Mobile: colored dots */}
                  {items.length > 0 && (
                    <span className="flex gap-0.5 sm:hidden">
                      {items.slice(0, 3).map((b) => (
                        <span
                          key={b.id}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: STATUS[b.status].dot }}
                        />
                      ))}
                    </span>
                  )}
                </div>
                {/* Desktop: chips */}
                <div className="hidden sm:flex flex-col gap-0.5 mt-1">
                  {items.slice(0, 3).map((b) => (
                    <span
                      key={b.id}
                      className={`text-[10px] leading-tight truncate px-1 py-0.5 rounded border ${STATUS[b.status].chip}`}
                    >
                      {b.start} {b.roomId.replace('LOG-', '')}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="text-[10px] text-slate-400 px-1">+{items.length - 3} อื่น ๆ</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <Legend />
      </div>

      {/* Day detail sidebar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={18} className="text-[#1b3a6b]" />
          <h3 className="font-bold">{thaiFull(selectedDate)}</h3>
        </div>

        {dayList.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Calendar size={28} className="mx-auto mb-2 opacity-40" />
            ยังไม่มีการจองในวันนี้
            <div className="mt-3">
              <button
                onClick={() => onBookRoom(selectedDate)}
                className="text-[#1b3a6b] font-medium hover:underline"
              >
                + จองห้องวันนี้
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayList.map((b) => (
              <BookingRow key={b.id} b={b} roomName={roomName} masked={role === 'requester'} />
            ))}
            <button
              onClick={() => onBookRoom(selectedDate)}
              className="w-full mt-1 text-sm text-[#1b3a6b] font-medium border border-dashed border-[#7b9fd4] rounded-lg py-2 hover:bg-[#eef2f9] transition"
            >
              + เพิ่มการจองในวันนี้
            </button>
          </div>
        )}
      </div>
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

function BookingRow({
  b, roomName, masked,
}: {
  b: Booking
  roomName: (id: string) => string
  masked: boolean
}) {
  const S = STATUS[b.status]
  return (
    <div className="border border-slate-200 rounded-lg p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{masked ? 'จองแล้ว' : b.title}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Clock size={12} /> {b.start}–{b.end} · {roomName(b.roomId)}
          </p>
          {!masked && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Users size={12} /> {b.requester}
            </p>
          )}
        </div>
        <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${S.chip}`}>
          {S.label}
        </span>
      </div>
    </div>
  )
}
