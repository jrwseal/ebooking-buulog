import { useMemo } from 'react'
import { Calendar, Clock, MapPin, Users } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { STATUS, thaiFull, todayStr } from '../../utils/datetime'
import type { Booking } from '../../types'

interface AgendaViewProps {
  role: 'requester' | 'approver'
  onOpenDetail: (b: Booking) => void
}

export default function AgendaView({ role, onOpenDetail }: AgendaViewProps) {
  const masked = role === 'requester'
  const { rooms, bookings } = useStore()
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id

  const grouped = useMemo(() => {
    const upcoming = bookings
      .filter((b) => b.date >= todayStr)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    const map: Record<string, Booking[]> = {}
    for (const b of upcoming) (map[b.date] ??= []).push(b)
    return Object.entries(map)
  }, [bookings])

  if (grouped.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
        <Calendar size={30} className="mx-auto mb-2 opacity-40" />
        ไม่มีการจองที่กำลังจะมาถึง
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.map(([date, items]) => (
        <div key={date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 font-semibold text-sm text-slate-700">
            {thaiFull(date)}{' '}
            {date === todayStr && <span className="text-[#1b3a6b]">· วันนี้</span>}
          </div>
          <div className="p-3 space-y-2.5">
            {items.map((b) => {
              const S = STATUS[b.status]
              return (
                <button
                  key={b.id}
                  onClick={() => onOpenDetail(b)}
                  className="w-full text-left border border-slate-200 rounded-lg p-2.5 hover:border-[#7b9fd4] transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {masked ? 'จองแล้ว' : b.title}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock size={12} /> {b.start}–{b.end} ·{' '}
                        <MapPin size={12} /> {roomName(b.roomId)}
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
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
