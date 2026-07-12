import { useMemo, useState } from 'react'
import { Clock, MapPin, Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { STATUS, thaiFull, todayStr } from '../../utils/datetime'
import type { Booking } from '../../types'

interface MyBookingsViewProps {
  onOpenDetail: (b: Booking) => void
}

export default function MyBookingsView({ onOpenDetail }: MyBookingsViewProps) {
  const { rooms, bookings } = useStore()
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id

  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  function search() {
    setQuery(input.trim())
  }

  const mine = useMemo(
    () =>
      query
        ? bookings
            .filter((b) => b.bookingCode.toLowerCase() === query.toLowerCase())
            .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
        : [],
    [bookings, query],
  )

  const upcoming = mine.filter((b) => b.date >= todayStr && b.status !== 'rejected')
  const past     = mine.filter((b) => b.date < todayStr || b.status === 'rejected')

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="เลขที่อ้างอิงการจอง (Ref No.)"
          className="input flex-1"
        />
        <button
          onClick={search}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark text-sm"
        >
          <Search size={15} /> ค้นหา
        </button>
      </div>

      {!query && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
          <Search size={30} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">ใส่เลขที่อ้างอิงการจอง (Ref No.) แล้วกด ค้นหา</p>
        </div>
      )}

      {query && mine.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
          <Search size={30} className="mx-auto mb-2 opacity-40" />
          <p>ไม่พบการจองสำหรับ <span className="font-medium text-slate-600">{query}</span></p>
        </div>
      )}

      {mine.length > 0 && (
        <>
        <p className="text-xs text-slate-400">ผลการค้นหาเลขที่อ้างอิง <span className="font-medium text-slate-600 font-mono">{query}</span></p>

      {upcoming.length > 0 && (
        <Section title="ที่กำลังจะมาถึง / รออนุมัติ">
          {upcoming.map((b) => <BookingRow key={b.id} b={b} roomName={roomName(b.roomId)} onOpen={onOpenDetail} />)}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="ผ่านมาแล้ว / ไม่อนุมัติ">
          {past.map((b) => <BookingRow key={b.id} b={b} roomName={roomName(b.roomId)} onOpen={onOpenDetail} />)}
        </Section>
      )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {title}
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  )
}

function BookingRow({ b, roomName, onOpen }: { b: Booking; roomName: string; onOpen: (b: Booking) => void }) {
  const S = STATUS[b.status]
  return (
    <button
      onClick={() => onOpen(b)}
      className="w-full text-left border border-slate-100 rounded-lg p-3 hover:border-buu-subtle hover:bg-buu-tint/40 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{b.title}</p>
            {b.bookingCode && (
              <span className="font-mono text-[10px] font-bold text-buu bg-buu-tint px-1.5 py-0.5 rounded">
                {b.bookingCode}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
            <span className="flex items-center gap-1"><Clock size={11} />{thaiFull(b.date)} · {b.start}–{b.end}</span>
            <span className="flex items-center gap-1"><MapPin size={11} />{roomName}</span>
          </p>
        </div>
        <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${S.chip}`}>
          {S.label}
        </span>
      </div>
    </button>
  )
}
